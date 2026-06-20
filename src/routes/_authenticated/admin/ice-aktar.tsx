import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Upload,
  Loader2,
  ClipboardCopy,
  Braces,
  ListTree,
  ShieldCheck,
  FileUp,
  X,
  Database,
} from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { insertRows, distinctValues, auditAction, type JsonRow } from "@/lib/supabase-rest";
import { schemaCatalogFn, type ColumnMeta } from "@/lib/schema-catalog-server";
import {
  parseRows,
  validate,
  template,
  buildPrompt,
  normalizeKamubaseRow,
  type ImportRowResult,
  type JsonObj,
} from "@/lib/json-import";
import type { AdminSchema } from "@/lib/admin-config";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/ice-aktar")({
  component: IceAktar,
});

type Preset = {
  id: string;
  label: string;
  schema: AdminSchema;
  table: string;
  baseDefaults: JsonObj;
  rules: string;
  showsSubjectTopic?: boolean;
};

const PRESETS: Preset[] = [
  {
    id: "questions",
    label: "Sorular",
    schema: "public",
    table: "questions",
    baseDefaults: { difficulty: "medium", is_active: true },
    rules:
      "\nKURALLAR: Klinik senaryolu, 5 şıklı, tek doğru cevap. options = 5 elemanlı string dizi. correct_index 0-4 tam sayı. explanation dolu. Türkçe.",
    showsSubjectTopic: true,
  },
  {
    id: "kamubase_questions",
    label: "KamuBase Soruları",
    schema: "kamubase",
    table: "questions",
    baseDefaults: {
      exam: "KPSS",
      difficulty: "medium",
      is_active: true,
      is_user_generated: false,
      tags: ["app:kamubase", "exam:kpss"],
    },
    rules:
      "\nKURALLAR: KamuBase KPSS soru bankası. Qlinik/public.questions kullanma. subject, unit, topic değerlerini kamubase.topic_tree canonical ağacından seç. subject, unit, topic, subtopic, learning_objective dolu olsun. options=5 string. correct_index 0-4. option_rationales 5 eleman. tags app:kamubase ve exam:kpss içersin. metadata object içinde unit, subtopic, kazanim/learning_objective, question_type, cognitive_level olsun.",
    showsSubjectTopic: true,
  },
  {
    id: "question_bank",
    label: "Soru Bankası (canonical)",
    schema: "public",
    table: "question_bank",
    baseDefaults: { difficulty: "medium", is_active: true },
    rules:
      "\nKURALLAR: 5 şıklı, tek doğru, options 5 elemanlı dizi, correct_index 0-4, açıklama dolu. Türkçe.",
    showsSubjectTopic: true,
  },
  {
    id: "cases",
    label: "Vakalar",
    schema: "praticase",
    table: "cases",
    baseDefaults: { is_published: false, difficulty: "Orta" },
    rules:
      "\nKURALLAR: PratiCase vaka katalog satırı. jsonb alanları (patient_profile, expected_history, rubric…) uygun nesne/dizi olsun. slug küçük-harf-tire. is_published=false bırak (taslak).",
  },
  {
    id: "sb_products",
    label: "SourceBase Ürün",
    schema: "sourcebase",
    table: "products",
    baseDefaults: { status: "draft", currency: "TRY" },
    rules:
      "\nKURALLAR: title, slug (benzersiz, küçük-harf-tire), price_cents (kuruş, tam sayı). status=draft.",
  },
  {
    id: "store_products",
    label: "Mağaza Paketi",
    schema: "public",
    table: "store_products",
    baseDefaults: { is_active: false, currency: "TRY" },
    rules: "\nKURALLAR: code (benzersiz), name, price_cents (kuruş). is_active=false bırak.",
  },
  {
    id: "banners",
    label: "Ana Sayfa Banner",
    schema: "praticase",
    table: "home_banners",
    baseDefaults: { is_active: false },
    rules: "\nKURALLAR: title zorunlu. sort_order tam sayı. is_active=false bırak.",
  },
  {
    id: "announcements",
    label: "Duyuru",
    schema: "praticase",
    table: "announcements",
    baseDefaults: { is_active: true },
    rules: "\nKURALLAR: title + body. Türkçe.",
  },
  {
    id: "advanced",
    label: "Gelişmiş (tablo seç)",
    schema: "public",
    table: "",
    baseDefaults: {},
    rules: "",
  },
];

const SCHEMAS: AdminSchema[] = ["public", "kamubase", "sourcebase", "praticase"];

function IceAktar() {
  const [presetId, setPresetId] = useState("questions");
  const [advSchema, setAdvSchema] = useState<AdminSchema>("public");
  const [advTable, setAdvTable] = useState("");
  const [subject, setSubject] = useState("");
  const [unit, setUnit] = useState("");
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState("10");
  const [pasted, setPasted] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [results, setResults] = useState<ImportRowResult[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [showColumns, setShowColumns] = useState(false);
  const [writing, setWriting] = useState(false);
  const [writeResult, setWriteResult] = useState<{
    inserted: number;
    failed: number;
    log: string[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const preset = PRESETS.find((p) => p.id === presetId)!;
  const isAdvanced = preset.id === "advanced";
  const isKamubase = preset.id === "kamubase_questions";
  const schema = isAdvanced ? advSchema : preset.schema;
  const table = isAdvanced ? advTable.trim() : preset.table;
  const showsSubjectTopic = !isAdvanced && !!preset.showsSubjectTopic;

  // reset state on target change
  useEffect(() => {
    setResults(null);
    setParseError(null);
    setPasted("");
    setFileName(null);
    setSubject("");
    setUnit("");
    setTopic("");
    setWriteResult(null);
  }, [presetId, advSchema, advTable]);

  const catalogQuery = useQuery({
    queryKey: ["import-catalog", schema, table],
    queryFn: () => schemaCatalogFn({ data: { schema, table } }),
    enabled: !!table || isAdvanced,
    retry: false,
  });
  const columns: ColumnMeta[] = catalogQuery.data?.columns ?? [];
  const advTables = catalogQuery.data?.tables ?? [];

  const refTable = isKamubase ? "topic_tree" : table;
  const subjectsQ = useQuery({
    queryKey: ["distinct", schema, refTable, "subject"],
    queryFn: () => distinctValues({ schema, table: refTable, column: "subject" }),
    enabled: showsSubjectTopic && !!refTable,
    retry: false,
  });
  const topicsQ = useQuery({
    queryKey: ["distinct", schema, refTable, "topic"],
    queryFn: () => distinctValues({ schema, table: refTable, column: "topic" }),
    enabled: showsSubjectTopic && !!refTable,
    retry: false,
  });
  const unitsQ = useQuery({
    queryKey: ["distinct", schema, refTable, "unit"],
    queryFn: () => distinctValues({ schema, table: refTable, column: "unit" }),
    enabled: showsSubjectTopic && isKamubase && !!refTable,
    retry: false,
  });

  const defaults = useMemo<JsonObj>(() => {
    if (isAdvanced) return {};
    const d: JsonObj = { ...preset.baseDefaults };
    if (showsSubjectTopic) {
      if (subject) d.subject = subject;
      if (isKamubase && unit) d.unit = unit;
      if (topic) d.topic = topic;
    }
    return d;
  }, [preset, subject, unit, topic, isAdvanced, isKamubase, showsSubjectTopic]);

  const validCount = results?.filter((r) => r.valid).length ?? 0;
  const repairedCount =
    results?.filter((r) => r.filled.length || r.coerced.length || r.dropped.length).length ?? 0;
  const invalidCount = results?.filter((r) => !r.valid).length ?? 0;

  function copyPrompt() {
    navigator.clipboard
      .writeText(buildPrompt(table, columns, defaults, Number(count) || 10, preset.rules))
      .then(() => toast.success("Prompt panoya kopyalandı"));
  }
  function copyTemplate() {
    navigator.clipboard
      .writeText(JSON.stringify(template(columns, defaults), null, 2))
      .then(() => toast.success("Şablon panoya kopyalandı"));
  }

  function check() {
    setWriteResult(null);
    const { rows, error } = parseRows(pasted);
    if (!rows) {
      setResults(null);
      setParseError(error ?? "Ayrıştırılamadı");
      return;
    }
    setParseError(null);
    setResults(validate(rows, columns, defaults));
  }

  async function onFile(file: File) {
    const text = await file.text();
    setPasted(text);
    setFileName(file.name);
    const { rows, error } = parseRows(text);
    if (!rows) {
      setResults(null);
      setParseError(error ?? "Ayrıştırılamadı");
      return;
    }
    setParseError(null);
    setResults(validate(rows, columns, defaults));
  }

  async function write() {
    if (!results || !table) return;
    const valid = results.filter((r) => r.valid);
    if (valid.length === 0) return;
    setWriting(true);
    setWriteResult(null);
    let inserted = 0,
      failed = 0;
    const log: string[] = [];
    const prepare = (row: JsonObj) => (isKamubase ? normalizeKamubaseRow(row) : row);
    for (let i = 0; i < valid.length; i += 100) {
      const batch = valid.slice(i, i + 100);
      try {
        await insertRows(
          schema,
          table,
          batch.map((r) => prepare(r.normalized) as JsonRow),
        );
        inserted += batch.length;
      } catch {
        // batch failed → satır satır dene, hataları raporla
        for (const r of batch) {
          try {
            await insertRows(schema, table, prepare(r.normalized) as JsonRow);
            inserted += 1;
          } catch (e) {
            failed += 1;
            if (log.length < 12)
              log.push(`#${r.index + 1}: ${String((e as Error).message).slice(0, 120)}`);
          }
        }
      }
    }
    await auditAction({
      action: "bulk_insert",
      schema,
      table,
      after: { inserted, failed },
      reason: "ice_aktar",
    });
    setWriteResult({ inserted, failed, log });
    setWriting(false);
    if (failed === 0 && inserted > 0) {
      toast.success(`${inserted} kayıt ${table} tablosuna yazıldı`);
      setPasted("");
      setFileName(null);
      setResults(null);
    } else if (inserted > 0) toast.warning(`${inserted} yazıldı, ${failed} hata`);
    else toast.error("Yazılamadı");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="İçe Aktar (JSON)"
        description="Dışarıdaki AI/otomasyondan gelen JSON ile veritabanını güvenle doldur"
        icon={Upload}
      />

      {/* Preset chips */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            onClick={() => setPresetId(p.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              presetId === p.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isAdvanced ? (
        <SectionCard title="Hedef tablo">
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <Field label="Şema">
              <Select value={advSchema} onValueChange={(v) => setAdvSchema(v as AdminSchema)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEMAS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tablo">
              <Select value={advTable} onValueChange={setAdvTable}>
                <SelectTrigger>
                  <SelectValue placeholder="Tablo seç…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {advTables.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </SectionCard>
      ) : null}

      {/* Step 1: Hedef & prompt */}
      <SectionCard
        title="1) Hedef & prompt"
        description={table ? `${schema}.${table} • ${columns.length} kolon` : "Önce tablo seç"}
      >
        <div className="space-y-3">
          {showsSubjectTopic ? (
            <div className="grid gap-3 md:grid-cols-3">
              <Combo
                label="Ders"
                value={subject}
                onChange={setSubject}
                options={subjectsQ.data ?? []}
                placeholder="Ders seç/yaz…"
              />
              {isKamubase ? (
                <Combo
                  label="Ünite"
                  value={unit}
                  onChange={setUnit}
                  options={unitsQ.data ?? []}
                  placeholder="Ünite seç/yaz…"
                />
              ) : null}
              <Combo
                label="Konu"
                value={topic}
                onChange={setTopic}
                options={topicsQ.data ?? []}
                placeholder="Konu seç/yaz…"
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Adet (prompt için)" className="w-32">
              <Input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="default"
                size="sm"
                disabled={columns.length === 0}
                onClick={copyPrompt}
              >
                <ClipboardCopy className="mr-1.5 h-4 w-4" /> Prompt'u Kopyala
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={columns.length === 0}
                onClick={copyTemplate}
              >
                <Braces className="mr-1.5 h-4 w-4" /> Boş Şablon
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowColumns((s) => !s)}>
                <ListTree className="mr-1.5 h-4 w-4" />{" "}
                {showColumns ? "Kolonları Gizle" : "Şema Kolonları"}
              </Button>
            </div>
          </div>
          {catalogQuery.isLoading ? (
            <div className="text-xs text-muted-foreground">Kolonlar yükleniyor…</div>
          ) : null}
          {showColumns && columns.length > 0 ? (
            <div className="rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap gap-1.5">
                {columns.map((c) => (
                  <Badge
                    key={c.name}
                    variant="outline"
                    className={
                      c.isPrimaryKey
                        ? "border-warning/40 bg-warning/10 text-warning"
                        : !c.nullable
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : ""
                    }
                  >
                    {c.name}
                    <span className="ml-1 opacity-60">{c.format || c.type}</span>
                    {c.isPrimaryKey ? " · PK" : !c.nullable ? " · zorunlu" : ""}
                  </Badge>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* Step 2: Paste / file */}
      <SectionCard title="2) AI / otomasyon çıktısını yapıştır">
        <div className="space-y-2">
          {fileName ? (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-sm">
              <Database className="h-4 w-4 text-info" />
              <span className="font-medium">{fileName}</span>
              <span className="text-xs text-muted-foreground">yüklendi</span>
              <Button
                variant="ghost"
                size="icon"
                className="ml-auto h-7 w-7"
                onClick={() => {
                  setFileName(null);
                  setPasted("");
                  setResults(null);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <Textarea
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder='[ { "subject": "…", "topic": "…", "text": "…", "options": ["A","B","C","D","E"], "correct_index": 0, "explanation": "…" } ]'
              className="min-h-[180px] font-mono text-xs"
            />
          )}
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".json,.txt,application/json,text/plain"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
              }}
            />
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              <FileUp className="mr-1.5 h-4 w-4" />{" "}
              {fileName ? "Dosyayı Değiştir" : "JSON Dosyası Seç"}
            </Button>
            <Button size="sm" disabled={!pasted || columns.length === 0} onClick={check}>
              <ShieldCheck className="mr-1.5 h-4 w-4" /> Kontrol Et
            </Button>
            {parseError ? <span className="text-xs text-destructive">{parseError}</span> : null}
          </div>
        </div>
      </SectionCard>

      {/* Step 3: Validate & write */}
      {results ? (
        <SectionCard title="3) Doğrulama & yazma">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{results.length} kayıt</Badge>
              <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
                {validCount} geçerli
              </Badge>
              {repairedCount > 0 ? (
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                  {repairedCount} onarıldı
                </Badge>
              ) : null}
              {invalidCount > 0 ? (
                <Badge
                  variant="outline"
                  className="border-destructive/40 bg-destructive/10 text-destructive"
                >
                  {invalidCount} geçersiz
                </Badge>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground">
              Geçerli kayıtların tamamı yazılır; eksik alanlar varsayılanlarla tamamlanır, tanımsız
              anahtarlar atılır, tipler düzeltilir.
              {isKamubase
                ? " KamuBase satırları yazmadan önce canonical alanlar + tags + metadata ile normalize edilir."
                : ""}
            </p>
            <div className="flex items-center gap-3">
              <Button disabled={writing || validCount === 0} onClick={write}>
                {writing ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="mr-1.5 h-4 w-4" />
                )}{" "}
                DB'ye Yaz ({validCount})
              </Button>
              {writeResult ? (
                <span
                  className={cn(
                    "text-sm font-medium",
                    writeResult.failed === 0 ? "text-success" : "text-warning",
                  )}
                >
                  Yazıldı: {writeResult.inserted} • Hata: {writeResult.failed}
                </span>
              ) : null}
            </div>
            {writeResult?.log.length ? (
              <div className="space-y-0.5 rounded-md border border-destructive/30 bg-destructive/5 p-2">
                {writeResult.log.map((l, i) => (
                  <div key={i} className="font-mono text-[10px] text-destructive">
                    {l}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </SectionCard>
      ) : null}
    </div>
  );
}

function Combo({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  const listId = `dl-${label}-${useMemo(() => Math.random().toString(36).slice(2), [])}`;
  return (
    <Field label={label}>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
      />
      <datalist id={listId}>
        {options.slice(0, 500).map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Field>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
