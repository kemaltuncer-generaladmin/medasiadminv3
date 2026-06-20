import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Sparkles, Loader2, Wand2, Save, Search } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { aiGenerateFn, AI_MODELS, AI_DEFAULT_MODEL } from "@/lib/ai-server";
import { selectRows, insertRows, updateRow } from "@/lib/supabase-rest";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/ai-studio")({
  component: AIStudio,
});

type Mode = "genQuestions" | "improveQuestion" | "improveCase";

const QUESTION_COLUMNS = new Set([
  "subject",
  "topic",
  "difficulty",
  "text",
  "options",
  "correct_index",
  "explanation",
  "option_rationales",
  "tags",
  "is_active",
  "metadata",
  "source_file_name",
]);
const CASE_COLUMNS = new Set([
  "slug",
  "title",
  "branch",
  "difficulty",
  "duration_minutes",
  "setting",
  "candidate_prompt",
  "summary",
  "patient_profile",
  "expected_history",
  "expected_physical_exam",
  "expected_differentials",
  "expected_tests",
  "unnecessary_tests",
  "management_steps",
  "critical_mistakes",
  "rubric",
  "points",
  "icon_key",
  "flow_steps",
  "goals",
  "is_published",
]);

const QUESTION_GEN_SYSTEM = `Sen TUS (Tıpta Uzmanlık Sınavı) için kıdemli bir soru bankası editörüsün. Türkçe, klinik senaryolu, tek doğru cevaplı, 5 şıklı yüksek kaliteli sorular üretirsin. Tıbbi doğruluk esastır. Çıktıyı SADECE geçerli JSON DİZİSİ olarak ver, başka metin yazma. Her öğe şu şemada: {"subject":string,"topic":string,"difficulty":"easy|medium|hard","text":string,"options":[5 string],"correct_index":0-4 tam sayı,"explanation":string,"option_rationales":[5 string]}.`;

const QUESTION_IMPROVE_SYSTEM = `Sen kıdemli bir TUS soru editörüsün. Verilen soruyu iyileştir: kökü netleştir, çeldiricileri güçlendir, açıklamayı ve option_rationales'i zenginleştir. DOĞRU CEVABI (correct_index) ve şıkların anlamını BOZMA. Çıktı SADECE tek bir JSON nesnesi, aynı şema.`;

const CASE_SYSTEM = `Sen PratiCase için kıdemli bir OSCE klinik vaka yazarısın. Türkçe, gerçekçi tek bir hasta vakası üret. Çıktı SADECE geçerli tek JSON nesnesi olsun. Alanlar: slug(küçük harf-tire), title, branch, difficulty("Kolay|Orta|Zor"), duration_minutes(tam sayı), setting, candidate_prompt, summary, patient_profile(obje: age,name,gender,mainComplaint,openingLine,diagnosisName), expected_history(string dizi), expected_physical_exam(string dizi), expected_differentials(string dizi), expected_tests(string dizi), unnecessary_tests(string dizi), management_steps(string dizi), critical_mistakes(string dizi), rubric(obje: history,physicalExam,tests,differentialDiagnosis,management,communication; toplam 100), points(tam sayı), icon_key.`;

function prettify(text: string) {
  const t = text.trim();
  try {
    return JSON.stringify(JSON.parse(t), null, 2);
  } catch {
    return t;
  }
}

function AIStudio() {
  const [mode, setMode] = useState<Mode>("genQuestions");
  const [provider, setProvider] = useState<"vertex" | "openai">("vertex");
  const [model, setModel] = useState(AI_DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(0.3);

  const [subject, setSubject] = useState("Dahiliye");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [count, setCount] = useState("5");

  const [searchText, setSearchText] = useState("");
  const [candidates, setCandidates] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  const isImprove = mode === "improveQuestion" || mode === "improveCase";

  const resetMode = (m: Mode) => {
    setMode(m);
    setOutput("");
    setStatus(null);
    setCandidates([]);
    setSelectedId(null);
  };

  const searchMut = useMutation({
    mutationFn: async () => {
      if (mode === "improveQuestion") {
        const r = await selectRows({
          schema: "public",
          table: "questions",
          select: "id,text",
          rawQuery: `text=ilike.*${searchText.trim()}*&order=created_at.desc`,
          limit: 25,
        });
        return r.data.map((row) => ({
          id: String(row.id),
          label: String(row.text ?? "").slice(0, 80),
        }));
      }
      const r = await selectRows({
        schema: "praticase",
        table: "cases",
        select: "id,title",
        rawQuery: `title=ilike.*${searchText.trim()}*&order=created_at.desc`,
        limit: 25,
      });
      return r.data.map((row) => ({ id: String(row.id), label: String(row.title ?? "") }));
    },
    onSuccess: (rows) => setCandidates(rows),
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const loadMut = useMutation({
    mutationFn: async (id: string) => {
      const table = mode === "improveQuestion" ? "questions" : "cases";
      const schema = mode === "improveQuestion" ? "public" : "praticase";
      const r = await selectRows({
        schema: schema as "public" | "praticase",
        table,
        rawQuery: `id=eq.${id}`,
        limit: 1,
      });
      const row = { ...(r.data[0] ?? {}) };
      delete (row as Record<string, unknown>).created_at;
      delete (row as Record<string, unknown>).updated_at;
      return JSON.stringify(row, null, 2);
    },
    onSuccess: (json) => setOutput(json),
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const genMut = useMutation({
    mutationFn: async () => {
      let system = "";
      let user = "";
      if (mode === "genQuestions") {
        system = QUESTION_GEN_SYSTEM;
        user = `Ders: ${subject}\nKonu: ${topic || "genel"}\nZorluk: ${difficulty}\nAdet: ${count} soru üret.`;
      } else if (mode === "improveQuestion") {
        system = QUESTION_IMPROVE_SYSTEM;
        user = `İyileştirilecek soru (JSON):\n${output}`;
      } else {
        system = `${CASE_SYSTEM}\nVerilen vakayı koruyarak içeriğini zenginleştir ve tıbbi tutarlılığını artır.`;
        user = `İyileştirilecek vaka (JSON):\n${output}`;
      }
      const { text } = await aiGenerateFn({ data: { provider, system, user, model, temperature } });
      return prettify(text);
    },
    onSuccess: (text) => {
      setOutput(text);
      setStatus("Üretildi — incele ve 'Uygula' ile kaydet.");
    },
    onError: (e) => {
      setStatus(null);
      toast.error(String((e as Error).message).slice(0, 240));
    },
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      if (mode === "genQuestions") {
        const arr = JSON.parse(output) as Array<Record<string, unknown>>;
        if (!Array.isArray(arr)) throw new Error("Çıktı bir JSON dizisi olmalı.");
        const rows = arr.map((item) => {
          const f: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item)) if (QUESTION_COLUMNS.has(k)) f[k] = v;
          f.is_active = true;
          f.source_file_name = "ai_admin_panel";
          return f;
        });
        await insertRows("public", "questions", rows);
        return `${rows.length} soru eklendi`;
      }
      if (mode === "improveQuestion") {
        if (!selectedId) throw new Error("Önce bir soru seç.");
        const obj = JSON.parse(output) as Record<string, unknown>;
        const f: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(obj)) if (QUESTION_COLUMNS.has(k)) f[k] = v;
        await updateRow({ schema: "public", table: "questions", id: selectedId, fields: f });
        return "Soru güncellendi";
      }
      if (!selectedId) throw new Error("Önce bir vaka seç.");
      const obj = JSON.parse(output) as Record<string, unknown>;
      const f: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) if (CASE_COLUMNS.has(k)) f[k] = v;
      delete f.slug;
      await updateRow({ schema: "praticase", table: "cases", id: selectedId, fields: f });
      return "Vaka güncellendi";
    },
    onSuccess: (msg) => {
      setStatus(`${msg} ✓`);
      toast.success(msg);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 240)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Stüdyo"
        description="Vertex Gemini / OpenAI ile içerik üretimi ve iyileştirme"
        icon={Sparkles}
        actions={
          <div className="flex items-center gap-2">
            <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
              <SelectTrigger className="h-9 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="vertex">Vertex</SelectItem>
                <SelectItem value="openai">OpenAI</SelectItem>
              </SelectContent>
            </Select>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger className="h-9 w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(provider === "vertex" ? AI_MODELS : ["gpt-4o", "gpt-4o-mini", "gpt-4.1"]).map(
                  (m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Tabs value={mode} onValueChange={(v) => resetMode(v as Mode)}>
        <TabsList>
          <TabsTrigger value="genQuestions">Soru Üret</TabsTrigger>
          <TabsTrigger value="improveQuestion">Soru İyileştir</TabsTrigger>
          <TabsTrigger value="improveCase">Vaka İyileştir</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        Tam vaka üretimi (5 OSCE modülü + canlıya alma) için{" "}
        <span className="font-medium">Vaka Üretim</span> bölümünü kullanın.
      </div>

      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <SectionCard title={isImprove ? "İyileştirilecek kaydı bul" : "Üretim ayarları"}>
          {isImprove ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Input
                  placeholder={mode === "improveQuestion" ? "soru metni…" : "vaka başlığı…"}
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={searchMut.isPending}
                  onClick={() => searchMut.mutate()}
                >
                  {searchMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <div className="max-h-56 space-y-1 overflow-y-auto">
                {candidates.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => {
                      setSelectedId(c.id);
                      loadMut.mutate(c.id);
                    }}
                    className={`w-full rounded px-2 py-1.5 text-left text-xs ${selectedId === c.id ? "bg-primary/10 text-primary" : "hover:bg-muted"}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Ders">
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Konu (ops.)">
                <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Zorluk">
                  <Select value={difficulty} onValueChange={setDifficulty}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["easy", "medium", "hard"].map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Adet">
                  <Input
                    value={count}
                    onChange={(e) => setCount(e.target.value)}
                    inputMode="numeric"
                  />
                </Field>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Yaratıcılık (temperature)</Label>
              <span className="font-mono text-xs">{temperature.toFixed(2)}</span>
            </div>
            <Slider
              value={[temperature]}
              min={0}
              max={1}
              step={0.05}
              onValueChange={([v]) => setTemperature(v)}
            />
          </div>

          <Button
            className="mt-4 w-full"
            disabled={genMut.isPending || (isImprove && !output)}
            onClick={() => genMut.mutate()}
          >
            {genMut.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-4 w-4" />
            )}
            {genMut.isPending ? "Üretiyor…" : "Üret"}
          </Button>
        </SectionCard>

        <SectionCard
          title="Çıktı (JSON)"
          actions={
            <Button
              size="sm"
              variant="secondary"
              disabled={!output || applyMut.isPending}
              onClick={() => applyMut.mutate()}
            >
              {applyMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}{" "}
              Uygula
            </Button>
          }
        >
          <Textarea
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="Üretilen JSON burada görünür ve düzenlenebilir…"
            className="min-h-[420px] font-mono text-xs"
          />
          {status ? <p className="mt-2 text-xs text-muted-foreground">{status}</p> : null}
        </SectionCard>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
