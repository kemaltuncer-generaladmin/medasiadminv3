import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileText, RotateCcw, Save } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { MODULES, type ModuleKey } from "@/lib/praticase-ai-server";
import {
  defaultPrompt,
  effectivePrompt,
  hasOverride,
  setOverride,
  resetOverride,
  getTemperature,
  setTemperature,
} from "@/lib/prompt-library";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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

export const Route = createFileRoute("/_authenticated/admin/prompts")({
  component: Prompts,
});

function Prompts() {
  const [selected, setSelected] = useState<ModuleKey>("history");
  const [text, setText] = useState("");
  const [overridden, setOverridden] = useState(false);
  const [temp, setTemp] = useState(0.3);

  useEffect(() => {
    setText(effectivePrompt(selected));
    setOverridden(hasOverride(selected));
  }, [selected]);

  useEffect(() => {
    setTemp(getTemperature());
  }, []);

  const dirty = text.trim() !== effectivePrompt(selected).trim();

  function save() {
    setOverride(selected, text);
    setOverridden(hasOverride(selected));
    toast.success("Prompt kaydedildi");
  }
  function reset() {
    resetOverride(selected);
    setText(defaultPrompt(selected));
    setOverridden(false);
    toast.info("Varsayılana döndürüldü");
  }

  const current = MODULES.find((m) => m.key === selected)!;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prompt Kütüphanesi"
        description="Düzenlenebilir AI sistem yönergeleri + üretim sıcaklığı (yerel saklanır)"
        icon={FileText}
      />

      <SectionCard title="Üretim sıcaklığı (varsayılan temperature)">
        <div className="flex items-center gap-4">
          <Slider
            value={[temp]}
            min={0}
            max={1}
            step={0.05}
            onValueChange={([v]) => setTemp(v)}
            className="max-w-md"
          />
          <span className="font-mono text-sm">{temp.toFixed(2)}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setTemperature(temp);
              toast.success("Sıcaklık kaydedildi");
            }}
          >
            Kaydet
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title="PratiCase modül promptları"
        description={current.displayName}
        actions={
          <div className="flex items-center gap-2">
            {overridden ? (
              <Badge variant="outline" className="border-warning/30 bg-warning/15 text-warning">
                özelleştirildi
              </Badge>
            ) : (
              <Badge variant="outline">varsayılan</Badge>
            )}
            <Select value={selected} onValueChange={(v) => setSelected(v as ModuleKey)}>
              <SelectTrigger className="h-9 w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODULES.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[420px] font-mono text-[11px]"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="outline" onClick={reset} disabled={!overridden}>
            <RotateCcw className="mr-1.5 h-4 w-4" /> Varsayılana Dön
          </Button>
          <Button onClick={save} disabled={!dirty}>
            <Save className="mr-1.5 h-4 w-4" /> Kaydet
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
