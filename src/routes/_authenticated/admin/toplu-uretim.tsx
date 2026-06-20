import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Layers, Loader2, Rocket } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { aiGenerateFn, AI_MODELS, AI_DEFAULT_MODEL } from "@/lib/ai-server";
import { insertRows, auditAction } from "@/lib/supabase-rest";
import type { AdminSchema } from "@/lib/admin-config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/toplu-uretim")({
  component: TopluUretim,
});

const QUESTION_GEN_SYSTEM = `Sen TUS (Tıpta Uzmanlık Sınavı) için kıdemli bir soru bankası editörüsün. Türkçe, klinik senaryolu, tek doğru cevaplı, 5 şıklı yüksek kaliteli sorular üretirsin. Tıbbi doğruluk esastır. Çıktıyı SADECE geçerli JSON DİZİSİ olarak ver, başka metin yazma. Her öğe şu şemada: {"subject":string,"topic":string,"difficulty":"easy|medium|hard","text":string,"options":[5 string],"correct_index":0-4 tam sayı,"explanation":string,"option_rationales":[5 string]}.`;

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

type Row = {
  topic: string;
  status: "pending" | "running" | "done" | "failed";
  count: number;
  error?: string;
};

function cleanJson(raw: string) {
  let v = raw.trim();
  if (v.startsWith("```"))
    v = v
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  return v;
}

function TopluUretim() {
  const [subject, setSubject] = useState("Dahiliye");
  const [topicsText, setTopicsText] = useState("");
  const [perTopic, setPerTopic] = useState("5");
  const [difficulty, setDifficulty] = useState("medium");
  const [target, setTarget] = useState<AdminSchema>("public");
  const [provider, setProvider] = useState<"vertex" | "openai">("vertex");
  const [model, setModel] = useState(AI_DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(0.4);
  const [autoInsert, setAutoInsert] = useState(true);

  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [collected, setCollected] = useState<Record<string, unknown>[]>([]);

  const topics = topicsText
    .split("\n")
    .map((t) => t.trim())
    .filter(Boolean);

  async function run() {
    if (topics.length === 0) {
      toast.error("En az bir konu gir (her satıra bir konu).");
      return;
    }
    setBusy(true);
    const initial: Row[] = topics.map((t) => ({ topic: t, status: "pending", count: 0 }));
    setRows(initial);
    const all: Record<string, unknown>[] = [];
    const n = Math.max(1, Math.min(30, Number(perTopic) || 5));

    for (let idx = 0; idx < topics.length; idx++) {
      const topic = topics[idx];
      setRows((r) => r.map((x, i) => (i === idx ? { ...x, status: "running" } : x)));
      try {
        const user = `Ders: ${subject}\nKonu: ${topic}\nZorluk: ${difficulty}\nAdet: ${n} soru üret.`;
        const { text } = await aiGenerateFn({
          data: { provider, system: QUESTION_GEN_SYSTEM, user, model, temperature },
        });
        const parsed = JSON.parse(cleanJson(text));
        const arr = (
          Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as Record<string, unknown>).questions)
              ? (parsed as Record<string, unknown>).questions
              : []
        ) as Record<string, unknown>[];
        const prepared = arr.map((item) => {
          const f: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(item)) if (QUESTION_COLUMNS.has(k)) f[k] = v;
          f.subject = f.subject ?? subject;
          f.topic = f.topic ?? topic;
          f.is_active = true;
          f.source_file_name = "ai_bulk_panel";
          return f;
        });

        if (autoInsert && prepared.length > 0) {
          await insertRows(target, "questions", prepared);
        } else {
          all.push(...prepared);
        }
        setRows((r) =>
          r.map((x, i) => (i === idx ? { ...x, status: "done", count: prepared.length } : x)),
        );
      } catch (e) {
        setRows((r) =>
          r.map((x, i) =>
            i === idx
              ? { ...x, status: "failed", error: String((e as Error).message).slice(0, 140) }
              : x,
          ),
        );
      }
    }

    setCollected(all);
    if (autoInsert) {
      const total = topics.length;
      await auditAction({
        action: "bulk_generate_questions",
        schema: target,
        table: "questions",
        reason: `${subject} • ${total} konu`,
      });
      toast.success("Toplu üretim tamamlandı (otomatik eklendi).");
    } else {
      toast.success(`${all.length} soru üretildi — 'Tümünü Ekle' ile kaydet.`);
    }
    setBusy(false);
  }

  async function insertCollected() {
    if (collected.length === 0) return;
    setBusy(true);
    try {
      await insertRows(target, "questions", collected);
      await auditAction({
        action: "bulk_generate_questions",
        schema: target,
        table: "questions",
        reason: `${collected.length} soru`,
      });
      toast.success(`${collected.length} soru eklendi`);
      setCollected([]);
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 200));
    } finally {
      setBusy(false);
    }
  }

  const totalGenerated = rows.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Toplu Üretim"
        description="Birden çok konu için AI ile toplu soru üretimi"
        icon={Layers}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Ayarlar">
          <div className="space-y-3">
            <Field label="Ders">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Konular (her satıra bir konu)">
              <Textarea
                value={topicsText}
                onChange={(e) => setTopicsText(e.target.value)}
                rows={6}
                placeholder={"Hipertansiyon\nKalp yetmezliği\nAritmiler"}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Konu başına adet">
                <Input
                  value={perTopic}
                  onChange={(e) => setPerTopic(e.target.value)}
                  inputMode="numeric"
                />
              </Field>
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Hedef bank">
                <Select value={target} onValueChange={(v) => setTarget(v as AdminSchema)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="public">Qlinik (public)</SelectItem>
                    <SelectItem value="kamubase">KamuBase</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Sağlayıcı">
                <Select value={provider} onValueChange={(v) => setProvider(v as typeof provider)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="vertex">Vertex</SelectItem>
                    <SelectItem value="openai">OpenAI</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
            <Field label="Model">
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger>
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
            </Field>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Yaratıcılık</Label>
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
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={autoInsert}
                onChange={(e) => setAutoInsert(e.target.checked)}
              />
              Üretilenleri otomatik ekle
            </label>
            <Button className="w-full" disabled={busy || topics.length === 0} onClick={run}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 h-4 w-4" />
              )}
              {busy ? "Üretiliyor…" : `Üret (${topics.length} konu)`}
            </Button>
            {!autoInsert && collected.length > 0 ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={insertCollected}
              >
                Tümünü Ekle ({collected.length})
              </Button>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard
          title="İlerleme"
          description={totalGenerated > 0 ? `${totalGenerated} soru üretildi` : undefined}
        >
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Konuları girip "Üret"e bas.</p>
          ) : (
            <div className="space-y-1.5">
              {rows.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="truncate">{r.topic}</span>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.count > 0 ? (
                      <span className="text-xs text-muted-foreground">{r.count} soru</span>
                    ) : null}
                    <StatusBadge row={r} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}

function StatusBadge({ row }: { row: Row }) {
  if (row.status === "done")
    return (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
        tamam
      </Badge>
    );
  if (row.status === "running")
    return (
      <Badge variant="outline" className="border-info/30 bg-info/15 text-info">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        üretiliyor
      </Badge>
    );
  if (row.status === "failed")
    return (
      <Badge
        variant="outline"
        className="border-destructive/30 bg-destructive/15 text-destructive"
        title={row.error}
      >
        hata
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      bekliyor
    </Badge>
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
