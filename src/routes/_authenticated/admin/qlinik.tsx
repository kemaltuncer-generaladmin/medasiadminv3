import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  HelpCircle,
  Loader2,
  MoreVertical,
  Plus,
  RefreshCcw,
  XCircle,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, KpiCard } from "@/components/admin/shared";
import {
  qlinikAutomationStatusFn,
  type QlinikAutomationCheck,
  type QlinikAutomationStatus,
} from "@/lib/qlinik-automation-server";
import {
  selectRows,
  auditedInsert,
  auditedUpdate,
  auditedDelete,
  insertRows,
  type JsonRow,
} from "@/lib/supabase-rest";
import { fmtRelative } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/qlinik")({
  component: Qlinik,
});

const DIFFICULTIES = ["easy", "medium", "hard"];

type BankCfg = {
  label: string;
  schema: "public" | "kamubase";
  filter?: string;
  discipline?: string;
};
const BANKS: Record<string, BankCfg> = {
  qlinik: {
    label: "Qlinik Tıp",
    schema: "public",
    filter: "metadata->>discipline=eq.tip",
    discipline: "tip",
  },
  dis: {
    label: "Qlinik Diş",
    schema: "public",
    filter: "metadata->>discipline=eq.dis",
    discipline: "dis",
  },
  hemsirelik: {
    label: "Qlinik Hemşirelik",
    schema: "public",
    filter: "metadata->>discipline=eq.hemsirelik",
    discipline: "hemsirelik",
  },
  ftr: {
    label: "Qlinik FTR",
    schema: "public",
    filter: "metadata->>discipline=eq.ftr",
    discipline: "ftr",
  },
  veteriner: {
    label: "Qlinik Veterinerlik",
    schema: "public",
    filter: "metadata->>discipline=eq.veteriner",
    discipline: "veteriner",
  },
  kamubase: { label: "KamuBase", schema: "kamubase" },
};

function Qlinik() {
  const [bankKey, setBankKey] = useState("qlinik");
  const bank = BANKS[bankKey];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Soru Bankası"
        description="Disiplin bazlı soru yönetimi + sourcebase.candidate_questions inceleme kuyruğu"
        icon={HelpCircle}
      />

      {/* Disiplin/bank seçici — tüm sayfayı yönetir */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(BANKS).map(([k, b]) => (
          <button
            key={k}
            onClick={() => setBankKey(k)}
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
              bankKey === k
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>

      <BankKpis bank={bank} />

      <Tabs defaultValue="automation">
        <TabsList>
          <TabsTrigger value="automation">Otomasyon</TabsTrigger>
          <TabsTrigger value="bank">Soru Bankası</TabsTrigger>
          <TabsTrigger value="queue">İnceleme Kuyruğu</TabsTrigger>
        </TabsList>
        <TabsContent value="automation" className="mt-4">
          <QlinikAutomation />
        </TabsContent>
        <TabsContent value="bank" className="mt-4">
          <QuestionBank bank={bank} />
        </TabsContent>
        <TabsContent value="queue" className="mt-4">
          <ReviewQueue />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QlinikAutomation() {
  const statusQ = useQuery({
    queryKey: ["qlinik-automation-status"],
    queryFn: () => qlinikAutomationStatusFn(),
    retry: false,
  });
  const status = statusQ.data;

  return (
    <div className="space-y-4">
      <SectionCard
        title="Qlinik bağlantı merkezi"
        description="Admin panel, Qlinik uygulaması, Supabase ve PDF servisinin canlı ilişkisi"
        actions={
          <Button
            variant="outline"
            size="sm"
            disabled={statusQ.isFetching}
            onClick={() => statusQ.refetch()}
          >
            {statusQ.isFetching ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RefreshCcw className="mr-1.5 h-4 w-4" />
            )}
            Kontrol et
          </Button>
        }
      >
        {statusQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Otomasyon durumu okunuyor…
          </div>
        ) : statusQ.error ? (
          <div className="py-6 text-sm text-destructive">
            {String((statusQ.error as Error).message).slice(0, 220)}
          </div>
        ) : status ? (
          <AutomationOverview status={status} />
        ) : null}
      </SectionCard>

      {status ? (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <AutomationGroup title="Ortam ayarları" checks={status.env} />
            <AutomationGroup title="Canlı endpoint" checks={status.endpoints} />
            <AutomationGroup title="Ortak veri" checks={status.data} />
          </div>
          <AutomationSetup status={status} />
        </>
      ) : null}
    </div>
  );
}

function AutomationOverview({ status }: { status: QlinikAutomationStatus }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <KpiCard
        label="Genel durum"
        value={toneLabel(status.readiness)}
        tone={kpiTone(status.readiness)}
      />
      <KpiCard label="Başarılı kontrol" value={status.summary.ok} tone="success" />
      <KpiCard label="Uyarı" value={status.summary.warning} tone="warning" />
      <KpiCard label="Hata" value={status.summary.error} tone="destructive" />
    </div>
  );
}

function AutomationGroup({ title, checks }: { title: string; checks: QlinikAutomationCheck[] }) {
  return (
    <SectionCard title={title}>
      <div className="space-y-2">
        {checks.map((check) => (
          <AutomationCheckRow key={check.id} check={check} />
        ))}
      </div>
    </SectionCard>
  );
}

function AutomationCheckRow({ check }: { check: QlinikAutomationCheck }) {
  return (
    <div className="rounded-md border p-3">
      <div className="mb-1.5 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{check.label}</div>
          <div className="mt-0.5 break-words text-xs text-muted-foreground">{check.detail}</div>
        </div>
        <Badge variant="outline" className={cn("shrink-0", toneClass(check.tone))}>
          {toneLabel(check.tone)}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
        {check.status !== undefined && <span>HTTP {check.status}</span>}
        {check.ms !== undefined && <span>{check.ms} ms</span>}
        {check.count !== undefined && <span>{check.count} kayıt</span>}
      </div>
      {check.error && (
        <div className="mt-2 line-clamp-2 text-xs text-destructive">{check.error}</div>
      )}
    </div>
  );
}

function AutomationSetup({ status }: { status: QlinikAutomationStatus }) {
  const setup = status.setup;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <SectionCard title="Qlinik çalışma akışı" description="Kod yazmadan doğrulanacak zincir">
        <div className="space-y-2">
          {setup.qlinikRuntimeFlow.map((line, index) => (
            <div key={line} className="flex gap-2 rounded-md border p-3 text-sm">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {index + 1}
              </span>
              <span>{line}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          <EndpointLink label="Qlinik" url={setup.qlinikAppUrl} />
          <EndpointLink label="Edge Function" url={setup.edgeFunctionUrl} />
          <EndpointLink label="Admin Panel" url={setup.adminPanelUrl} />
          <EndpointLink label="PDF Endpoint" url={setup.pdfEndpoint} />
        </div>
      </SectionCard>

      <SectionCard
        title="Kurulum reçetesi"
        description="Qlinik deploy/build ekranına yapıştırılacak public ayarlar"
      >
        <div className="space-y-3">
          <CopyBlock label="Flutter dart-define" lines={setup.dartDefines} />
          <CopyBlock label="Docker build args" lines={setup.dockerBuildArgs} />
        </div>
      </SectionCard>
    </div>
  );
}

function EndpointLink({ label, url }: { label: string; url: string }) {
  if (!url) {
    return (
      <div className="rounded-md border p-2">
        <div className="font-medium">{label}</div>
        <div className="text-muted-foreground">eksik</div>
      </div>
    );
  }
  return (
    <a
      className="rounded-md border p-2 hover:bg-muted/50"
      href={url}
      target="_blank"
      rel="noreferrer"
    >
      <div className="flex items-center gap-1 font-medium">
        {label} <ExternalLink className="h-3 w-3" />
      </div>
      <div className="break-all text-muted-foreground">{url}</div>
    </a>
  );
}

function CopyBlock({ label, lines }: { label: string; lines: string[] }) {
  const text = lines.join("\n");
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="text-sm font-medium">{label}</div>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await navigator.clipboard.writeText(text);
            toast.success("Kopyalandı");
          }}
        >
          <Copy className="mr-1.5 h-4 w-4" /> Kopyala
        </Button>
      </div>
      <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all p-3 text-xs text-muted-foreground">
        {text}
      </pre>
    </div>
  );
}

function toneLabel(tone: "ok" | "warning" | "error") {
  if (tone === "ok") return "Hazır";
  if (tone === "warning") return "Uyarı";
  return "Hata";
}

function toneClass(tone: "ok" | "warning" | "error") {
  if (tone === "ok") return "border-success/30 bg-success/15 text-success";
  if (tone === "warning") return "border-warning/30 bg-warning/15 text-warning";
  return "border-destructive/30 bg-destructive/15 text-destructive";
}

function kpiTone(tone: "ok" | "warning" | "error") {
  if (tone === "ok") return "success";
  if (tone === "warning") return "warning";
  return "destructive";
}

function BankKpis({ bank }: { bank: BankCfg }) {
  const base = bank.filter ? `${bank.filter}&` : "";
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <CountQ
        label="Canlı soru"
        schema={bank.schema}
        rawQuery={`${base}is_active=eq.true`}
        tone="success"
      />
      <CountQ
        label="Pasif soru"
        schema={bank.schema}
        rawQuery={`${base}is_active=eq.false`}
        tone="warning"
      />
      <CountQ
        label="Kullanıcı üretimi"
        schema={bank.schema}
        rawQuery={`${base}is_user_generated=eq.true`}
      />
      <TaxKpi bank={bank} />
    </div>
  );
}

function CountQ({
  label,
  schema,
  rawQuery,
  tone,
}: {
  label: string;
  schema: "public" | "kamubase";
  rawQuery: string;
  tone?: "success" | "warning" | "default";
}) {
  const q = useQuery({
    queryKey: ["q-count", schema, rawQuery],
    queryFn: () =>
      selectRows({
        schema,
        table: "questions",
        select: "id",
        rawQuery: `${rawQuery}&limit=1`,
      }).then((r) => r.count ?? 0),
    retry: false,
  });
  return (
    <KpiCard label={label} value={q.isLoading ? "…" : q.error ? "!" : (q.data ?? 0)} tone={tone} />
  );
}

function TaxKpi({ bank }: { bank: BankCfg }) {
  // KamuBase → kamubase.topic_tree; Qlinik disiplinleri → public.qlinik_taxonomy?discipline_code
  const isKamu = bank.schema === "kamubase";
  const q = useQuery({
    queryKey: ["tax-count", bank.schema, bank.discipline],
    queryFn: () =>
      selectRows({
        schema: isKamu ? "kamubase" : "public",
        table: isKamu ? "topic_tree" : "qlinik_taxonomy",
        select: "id",
        rawQuery: isKamu ? "limit=1" : `discipline_code=eq.${bank.discipline}&limit=1`,
      }).then((r) => r.count ?? 0),
    retry: false,
  });
  return <KpiCard label="Taksonomi" value={q.isLoading ? "…" : q.error ? "!" : (q.data ?? 0)} />;
}

// ---------------------------------------------------------------------------
// Soru Bankası (public.questions)
// ---------------------------------------------------------------------------

function QuestionBank({ bank }: { bank: BankCfg }) {
  const qc = useQueryClient();
  const bankKey = bank.discipline ?? bank.schema;
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");
  const [editing, setEditing] = useState<JsonRow | null>(null);
  const [creating, setCreating] = useState(false);

  const rawQuery = useMemo(() => {
    const parts = ["order=created_at.desc"];
    if (bank.filter) parts.push(bank.filter);
    if (activeFilter === "active") parts.push("is_active=eq.true");
    if (activeFilter === "inactive") parts.push("is_active=eq.false");
    if (search.trim())
      parts.push(
        `or=(text.ilike.*${search.trim()}*,subject.ilike.*${search.trim()}*,topic.ilike.*${search.trim()}*)`,
      );
    return parts.join("&");
  }, [activeFilter, search, bank.filter]);

  const questionsQ = useQuery({
    queryKey: ["questions", bankKey, rawQuery],
    queryFn: () =>
      selectRows({
        schema: bank.schema,
        table: "questions",
        select: "id,subject,topic,difficulty,text,is_active,is_user_generated,created_at",
        rawQuery,
        limit: 300,
      }),
    retry: false,
  });
  const questions = questionsQ.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["questions"] });

  const toggleMut = useMutation({
    mutationFn: (q: JsonRow) =>
      auditedUpdate({
        schema: bank.schema,
        table: "questions",
        id: String(q.id),
        fields: { is_active: !(q.is_active ?? true) },
        action: (q.is_active ?? true) ? "deactivate_question" : "activate_question",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (q: JsonRow) =>
      auditedDelete({
        schema: bank.schema,
        table: "questions",
        id: String(q.id),
        action: "delete_question",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="Sorular"
      description={`${bank.schema}.questions${bank.discipline ? ` · ${bank.discipline}` : ""}`}
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Soru
        </Button>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Soru, ders, konu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <Select
          value={activeFilter}
          onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tümü</SelectItem>
            <SelectItem value="active">Aktif</SelectItem>
            <SelectItem value="inactive">Pasif</SelectItem>
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">
          {questionsQ.data?.count ?? questions.length} kayıt
        </Badge>
      </div>

      {questionsQ.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : questionsQ.error ? (
        <div className="py-6 text-sm text-destructive">
          {String((questionsQ.error as Error).message).slice(0, 200)}
        </div>
      ) : questions.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">Soru bulunamadı.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Ders / Konu</TableHead>
                <TableHead>Zorluk</TableHead>
                <TableHead>Soru</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {questions.map((q) => (
                <TableRow
                  key={String(q.id)}
                  className="cursor-pointer"
                  onClick={() => setEditing(q)}
                >
                  <TableCell>
                    <div className="text-sm font-medium">{String(q.subject ?? "—")}</div>
                    <div className="text-xs text-muted-foreground">{String(q.topic ?? "")}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{String(q.difficulty ?? "—")}</Badge>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="line-clamp-2 text-xs">{String(q.text ?? "")}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={(q.is_active ?? true) ? "active" : "inactive"} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(q)}>Düzenle</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleMut.mutate(q)}>
                          {(q.is_active ?? true) ? "Pasifleştir" : "Aktifleştir"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMut.mutate(q)}
                        >
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <QuestionEditor
        open={creating}
        onOpenChange={setCreating}
        question={null}
        bank={bank}
        onSaved={invalidate}
      />
      <QuestionEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        question={editing}
        bank={bank}
        onSaved={invalidate}
      />
    </SectionCard>
  );
}

function QuestionEditor({
  question,
  bank,
  open,
  onOpenChange,
  onSaved,
}: {
  question: JsonRow | null;
  bank: BankCfg;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = !question;
  const [subject, setSubject] = useState("");
  const [topic, setTopic] = useState("");
  const [difficulty, setDifficulty] = useState("medium");
  const [text, setText] = useState("");
  const [options, setOptions] = useState("");
  const [correctIndex, setCorrectIndex] = useState("0");
  const [explanation, setExplanation] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [needFull, setNeedFull] = useState(false);

  const fullQ = useQuery({
    queryKey: ["question-full", bank.schema, question?.id],
    queryFn: () =>
      selectRows({
        schema: bank.schema,
        table: "questions",
        rawQuery: `id=eq.${question?.id}`,
        limit: 1,
      }),
    enabled: open && !!question && needFull,
    retry: false,
  });

  useEffect(() => {
    if (!open) return;
    const src = (needFull ? fullQ.data?.data?.[0] : undefined) ?? question ?? {};
    setSubject(String(src.subject ?? ""));
    setTopic(String(src.topic ?? ""));
    setDifficulty(String(src.difficulty ?? "medium"));
    setText(String(src.text ?? ""));
    setOptions(src.options ? JSON.stringify(src.options, null, 2) : "[]");
    setCorrectIndex(String(src.correct_index ?? 0));
    setExplanation(String(src.explanation ?? ""));
    setIsActive(Boolean(src.is_active ?? true));
  }, [open, question, fullQ.data, needFull]);

  useEffect(() => {
    if (open && question) setNeedFull(true);
    else setNeedFull(false);
  }, [open, question]);

  const saveMut = useMutation({
    mutationFn: async () => {
      let parsedOptions: unknown = [];
      try {
        parsedOptions = options.trim() ? JSON.parse(options) : [];
      } catch {
        throw new Error("Şıklar geçerli JSON dizisi olmalı.");
      }
      const fields: Record<string, unknown> = {
        subject,
        topic,
        difficulty,
        text,
        options: parsedOptions,
        correct_index: Number(correctIndex) || 0,
        explanation,
        is_active: isActive,
      };
      if (question)
        return auditedUpdate({
          schema: bank.schema,
          table: "questions",
          id: String(question.id),
          fields,
          action: "update_question",
        });
      if (bank.discipline) {
        // metadata.discipline kategoriyi belirler (bankayı bu filtreler);
        // access_disciplines = SADECE bu disiplin → yalnızca o disiplini seçen kullanıcılar görür.
        fields.metadata = { discipline: bank.discipline };
        fields.access_disciplines = [bank.discipline];
        fields.tags = ["app:qlinik", `discipline:${bank.discipline}`];
      }
      return auditedInsert({
        schema: bank.schema,
        table: "questions",
        values: fields,
        action: "create_question",
      });
    },
    onSuccess: () => {
      toast.success(isNew ? "Soru oluşturuldu" : "Kaydedildi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? "Yeni Soru" : "Soruyu Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Ders">
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </Field>
            <Field label="Konu">
              <Input value={topic} onChange={(e) => setTopic(e.target.value)} />
            </Field>
            <Field label="Zorluk">
              <Select value={difficulty} onValueChange={setDifficulty}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIFFICULTIES.map((d) => (
                    <SelectItem key={d} value={d}>
                      {d}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Soru metni">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} />
          </Field>
          <Field label="Şıklar (JSON dizisi)">
            <Textarea
              value={options}
              onChange={(e) => setOptions(e.target.value)}
              rows={4}
              className="font-mono text-xs"
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Doğru şık index">
              <Input
                value={correctIndex}
                onChange={(e) => setCorrectIndex(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <div className="flex items-end justify-between rounded-md border px-3 pb-2">
              <Label className="text-sm">Aktif</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
          <Field label="Açıklama">
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              rows={2}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={!text.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{" "}
            {isNew ? "Oluştur" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// İnceleme Kuyruğu (sourcebase.candidate_questions → public.question_bank)
// ---------------------------------------------------------------------------

function ReviewQueue() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [reviewing, setReviewing] = useState<JsonRow | null>(null);

  const candidatesQ = useQuery({
    queryKey: ["candidates"],
    queryFn: () =>
      selectRows({
        schema: "sourcebase",
        table: "candidate_questions",
        rawQuery: "order=created_at.desc",
        limit: 800,
      }),
    retry: false,
  });
  const candidates = candidatesQ.data?.data ?? [];
  const statuses = Array.from(new Set(candidates.map((c) => String(c.status ?? "pending")))).sort();

  const filtered = useMemo(() => {
    let rows = candidates;
    if (statusFilter) rows = rows.filter((c) => String(c.status ?? "pending") === statusFilter);
    const q = search.trim().toLowerCase();
    if (q)
      rows = rows.filter((c) =>
        [c.question_text, c.subject, c.topic].some((f) =>
          String(f ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    return rows;
  }, [candidates, statusFilter, search]);

  const pending = candidates.filter((c) =>
    ["pending", "needs_review"].includes(String(c.status ?? "pending")),
  ).length;
  const invalidate = () => qc.invalidateQueries({ queryKey: ["candidates"] });

  const approveMut = useMutation({
    mutationFn: async (c: JsonRow) => {
      const bank = {
        external_id: c.question_id ?? null,
        subject: String(c.subject ?? "Genel"),
        topic: String(c.topic ?? "Genel"),
        difficulty: String(c.difficulty ?? "medium"),
        text: String(c.question_text ?? ""),
        options: c.options ?? [],
        correct_index: Number(c.correct_index ?? 0),
        explanation: String(c.explanation ?? ""),
        option_rationales: c.option_rationales ?? null,
        tags: c.tags ?? null,
        is_active: true,
      };
      await insertRows("public", "question_bank", bank);
      await auditedUpdate({
        schema: "sourcebase",
        table: "candidate_questions",
        id: String(c.id),
        fields: { status: "approved" },
        action: "approve_candidate",
      });
    },
    onSuccess: () => {
      invalidate();
      setReviewing(null);
      toast.success("Soru bankaya eklendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const rejectMut = useMutation({
    mutationFn: (c: JsonRow) =>
      auditedUpdate({
        schema: "sourcebase",
        table: "candidate_questions",
        id: String(c.id),
        fields: { status: "rejected" },
        action: "reject_candidate",
      }),
    onSuccess: () => {
      invalidate();
      setReviewing(null);
      toast.info("Aday reddedildi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="İnceleme Kuyruğu"
      description={`${pending} bekleyen • sourcebase.candidate_questions`}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Soru, ders, konu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-9 max-w-xs"
        />
        <Select
          value={statusFilter || "__all"}
          onValueChange={(v) => setStatusFilter(v === "__all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Durum" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">Tüm durumlar</SelectItem>
            {statuses.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Badge variant="outline" className="ml-auto">
          {filtered.length} kayıt
        </Badge>
      </div>

      {candidatesQ.isLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : candidatesQ.error ? (
        <div className="py-6 text-sm text-destructive">
          {String((candidatesQ.error as Error).message).slice(0, 200)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">Aday soru bulunamadı.</div>
      ) : (
        <div className="max-h-[600px] overflow-auto rounded-md border">
          <Table>
            <TableHeader className="sticky top-0 bg-card">
              <TableRow>
                <TableHead>Ders / Konu</TableHead>
                <TableHead>Aday Soru</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead>Tarih</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={String(c.id)}
                  className="cursor-pointer"
                  onClick={() => setReviewing(c)}
                >
                  <TableCell>
                    <div className="text-sm font-medium">{String(c.subject ?? "—")}</div>
                    <div className="text-xs text-muted-foreground">{String(c.topic ?? "")}</div>
                  </TableCell>
                  <TableCell className="max-w-md">
                    <div className="line-clamp-2 text-xs">{String(c.question_text ?? "")}</div>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={String(c.status ?? "pending")} />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {fmtRelative(c.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet open={reviewing !== null} onOpenChange={(o) => !o && setReviewing(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          {reviewing ? (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>Aday Soru</SheetTitle>
                <SheetDescription>
                  {String(reviewing.subject ?? "—")} • {String(reviewing.topic ?? "—")}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <SectionCard title="Soru">
                  <p className="whitespace-pre-wrap text-sm">
                    {String(reviewing.question_text ?? "—")}
                  </p>
                </SectionCard>
                <SectionCard title="Şıklar">
                  <ol className="list-decimal space-y-1 pl-5 text-sm">
                    {(Array.isArray(reviewing.options) ? (reviewing.options as unknown[]) : []).map(
                      (opt, i) => (
                        <li
                          key={i}
                          className={
                            i === Number(reviewing.correct_index ?? 0)
                              ? "font-semibold text-success"
                              : ""
                          }
                        >
                          {typeof opt === "string" ? opt : JSON.stringify(opt)}
                          {i === Number(reviewing.correct_index ?? 0) ? " ✓" : ""}
                        </li>
                      ),
                    )}
                  </ol>
                </SectionCard>
                {reviewing.explanation ? (
                  <SectionCard title="Açıklama">
                    <p className="whitespace-pre-wrap text-sm">{String(reviewing.explanation)}</p>
                  </SectionCard>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    disabled={approveMut.isPending || rejectMut.isPending}
                    onClick={() => approveMut.mutate(reviewing)}
                  >
                    {approveMut.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle2 className="mr-1.5 h-4 w-4" />
                    )}{" "}
                    Onayla → Banka
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-destructive hover:text-destructive"
                    disabled={approveMut.isPending || rejectMut.isPending}
                    onClick={() => rejectMut.mutate(reviewing)}
                  >
                    {rejectMut.isPending ? (
                      <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-1.5 h-4 w-4" />
                    )}{" "}
                    Reddet
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </SectionCard>
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
