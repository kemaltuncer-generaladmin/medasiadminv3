import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Wand2, Loader2, CheckCircle2, XCircle, RefreshCw, Rocket, Circle } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import {
  praticaseModuleFn,
  praticasePublishFn,
  MODULES,
  type ModuleKey,
} from "@/lib/praticase-ai-server";
import { AI_MODELS, AI_DEFAULT_MODEL } from "@/lib/ai-server";
import { effectivePrompt, hasOverride } from "@/lib/prompt-library";
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

export const Route = createFileRoute("/_authenticated/admin/vaka-uretim")({
  component: VakaUretim,
});

type ModuleState = "idle" | "generating" | "ready" | "failed";
type ModuleSlot = { state: ModuleState; json: string; error?: string };

function VakaUretim() {
  const [course, setCourse] = useState("Dahiliye");
  const [caseName, setCaseName] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [difficulty, setDifficulty] = useState("Orta");
  const [provider, setProvider] = useState<"vertex" | "openai">("vertex");
  const [model, setModel] = useState(AI_DEFAULT_MODEL);
  const [temperature, setTemperature] = useState(0.3);

  const [slots, setSlots] = useState<Record<ModuleKey, ModuleSlot>>(
    () =>
      Object.fromEntries(MODULES.map((m) => [m.key, { state: "idle", json: "" }])) as Record<
        ModuleKey,
        ModuleSlot
      >,
  );
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  const canGenerate = diagnosis.trim() !== "" || caseName.trim() !== "";
  const allReady = MODULES.every((m) => slots[m.key].state === "ready");

  const baseReq = () => ({
    course,
    caseName,
    diagnosisName: diagnosis,
    difficulty,
    model,
    provider,
    temperature,
  });
  const override = (key: ModuleKey) => (hasOverride(key) ? effectivePrompt(key) : undefined);

  const setSlot = (key: ModuleKey, slot: Partial<ModuleSlot>) =>
    setSlots((s) => ({ ...s, [key]: { ...s[key], ...slot } }));

  async function generateAll() {
    setBusy(true);
    setProgress(null);
    const prior: Array<{ key: ModuleKey; payload: unknown }> = [];
    try {
      for (const m of MODULES) {
        setSlot(m.key, { state: "generating", error: undefined });
        setProgress(`${m.displayName} üretiliyor…`);
        try {
          const res = await praticaseModuleFn({
            data: { format: m.key, ...baseReq(), systemOverride: override(m.key), prior },
          });
          prior.push({ key: m.key, payload: res.payload });
          setSlot(m.key, { state: "ready", json: JSON.stringify(res.payload, null, 2) });
        } catch (e) {
          setSlot(m.key, { state: "failed", error: String((e as Error).message).slice(0, 200) });
          setProgress(null);
          toast.error(`${m.displayName}: ${String((e as Error).message).slice(0, 160)}`);
          return;
        }
      }
      setProgress("5 modül üretildi — 'Canlıya Al' ile PratiCase'e yayınla.");
    } finally {
      setBusy(false);
    }
  }

  async function regenerate(key: ModuleKey) {
    const prior = MODULES.filter((m) => m.key !== key && slots[m.key].state === "ready")
      .map((m) => ({ key: m.key, payload: safeParse(slots[m.key].json) }))
      .filter((p) => p.payload != null) as Array<{ key: ModuleKey; payload: unknown }>;
    setSlot(key, { state: "generating", error: undefined });
    try {
      const res = await praticaseModuleFn({
        data: { format: key, ...baseReq(), systemOverride: override(key), prior },
      });
      setSlot(key, { state: "ready", json: JSON.stringify(res.payload, null, 2) });
    } catch (e) {
      setSlot(key, { state: "failed", error: String((e as Error).message).slice(0, 200) });
      toast.error(String((e as Error).message).slice(0, 160));
    }
  }

  async function publish() {
    const modules: Array<{ key: ModuleKey; payload: unknown }> = [];
    for (const m of MODULES) {
      const payload = safeParse(slots[m.key].json);
      if (payload == null) {
        toast.error(`${m.displayName}: geçersiz JSON`);
        return;
      }
      modules.push({ key: m.key, payload });
    }
    setPublishing(true);
    try {
      const res = await praticasePublishFn({ data: { ...baseReq(), modules } });
      setProgress(res.message);
      toast[res.isPublished ? "success" : "info"](res.message);
    } catch (e) {
      toast.error(String((e as Error).message).slice(0, 200));
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vaka Üretim"
        description="5 OSCE modülü ile AI vaka üretimi ve canlıya alma"
        icon={Wand2}
      />

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <SectionCard title="Üretim ayarları">
          <div className="space-y-3">
            <Field label="Branş / ders">
              <Input value={course} onChange={(e) => setCourse(e.target.value)} />
            </Field>
            <Field label="Tanı adı (zorunlu)">
              <Input
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="Örn. Akut apandisit"
              />
            </Field>
            <Field label="Vaka adı (ops.)">
              <Input value={caseName} onChange={(e) => setCaseName(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zorluk">
                <Select value={difficulty} onValueChange={setDifficulty}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["Kolay", "Orta", "Zor"].map((d) => (
                      <SelectItem key={d} value={d}>
                        {d}
                      </SelectItem>
                    ))}
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
                    (mm) => (
                      <SelectItem key={mm} value={mm}>
                        {mm}
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

            <Button className="w-full" disabled={!canGenerate || busy} onClick={generateAll}>
              {busy ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 h-4 w-4" />
              )}
              {busy ? "Üretiyor…" : "Tüm Modülleri Üret"}
            </Button>
            <Button
              variant="secondary"
              className="w-full"
              disabled={!allReady || publishing}
              onClick={publish}
            >
              {publishing ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Rocket className="mr-1.5 h-4 w-4" />
              )}
              Canlıya Al
            </Button>
            {progress ? <p className="text-xs text-muted-foreground">{progress}</p> : null}
          </div>
        </SectionCard>

        <div className="space-y-3">
          {MODULES.map((m) => {
            const slot = slots[m.key];
            return (
              <SectionCard
                key={m.key}
                title={m.displayName}
                actions={
                  <div className="flex items-center gap-2">
                    <StateBadge state={slot.state} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={busy || slot.state === "generating" || !canGenerate}
                      onClick={() => regenerate(m.key)}
                    >
                      {slot.state === "generating" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                }
              >
                {slot.state === "idle" ? (
                  <p className="text-xs text-muted-foreground">Henüz üretilmedi.</p>
                ) : slot.state === "failed" ? (
                  <p className="text-xs text-destructive">{slot.error}</p>
                ) : (
                  <Textarea
                    value={slot.json}
                    onChange={(e) => setSlot(m.key, { json: e.target.value })}
                    className="min-h-[140px] font-mono text-[11px]"
                    placeholder="Üretiliyor…"
                  />
                )}
              </SectionCard>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StateBadge({ state }: { state: ModuleState }) {
  if (state === "ready")
    return (
      <Badge variant="outline" className="border-success/30 bg-success/15 text-success">
        <CheckCircle2 className="mr-1 h-3 w-3" /> hazır
      </Badge>
    );
  if (state === "generating")
    return (
      <Badge variant="outline" className="border-info/30 bg-info/15 text-info">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" /> üretiliyor
      </Badge>
    );
  if (state === "failed")
    return (
      <Badge variant="outline" className="border-destructive/30 bg-destructive/15 text-destructive">
        <XCircle className="mr-1 h-3 w-3" /> hata
      </Badge>
    );
  return (
    <Badge variant="outline" className="text-muted-foreground">
      <Circle className="mr-1 h-3 w-3" /> bekliyor
    </Badge>
  );
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
