import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Download, FileText, Loader2, Printer, Search } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { selectRows, type JsonRow } from "@/lib/supabase-rest";
import { qlinikPdfFn } from "@/lib/qlinik-pdf-server";
import type { Discipline } from "@/lib/qlinik-pdf-template";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/pdf-cikti")({
  component: PdfCikti,
});

const PRINT_CSS = `
  * { box-sizing: border-box; }
  body { font-family: -apple-system, system-ui, sans-serif; color: #111; margin: 32px; line-height: 1.5; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
  .q { border: 1px solid #ddd; border-radius: 8px; padding: 14px 16px; margin-bottom: 14px; page-break-inside: avoid; }
  .q-head { font-size: 11px; color: #888; margin-bottom: 6px; }
  .q-text { font-weight: 600; margin-bottom: 8px; }
  .opt { padding: 2px 0 2px 18px; font-size: 14px; }
  .opt.correct { color: #15803d; font-weight: 700; }
  .exp { margin-top: 8px; font-size: 12px; color: #444; background: #f6f6f6; padding: 8px; border-radius: 6px; }
  .field { margin-bottom: 12px; page-break-inside: avoid; }
  .field h3 { font-size: 13px; margin: 0 0 4px; color: #333; }
  pre { white-space: pre-wrap; font-size: 11px; background: #f6f6f6; padding: 8px; border-radius: 6px; }
  @media print { body { margin: 0; padding: 20px; } }
`;

function esc(s: unknown) {
  return String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] ?? c,
  );
}

function printHtml(title: string, bodyHtml: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Yazdırma penceresi açılamadı (popup engelli olabilir).");
    return;
  }
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${bodyHtml}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

function PdfCikti() {
  const [mode, setMode] = useState<"questions" | "case">("questions");

  return (
    <div className="space-y-6">
      <PageHeader
        title="PDF Çıktı"
        description="Soru ve vakaları yazdırılabilir PDF olarak dışa aktar"
        icon={FileText}
      />
      <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
        <TabsList>
          <TabsTrigger value="questions">Sorular</TabsTrigger>
          <TabsTrigger value="case">Vaka</TabsTrigger>
        </TabsList>
      </Tabs>
      {mode === "questions" ? <QuestionsExport /> : <CaseExport />}
    </div>
  );
}

const DISCIPLINES: { value: Discipline; label: string }[] = [
  { value: "tip", label: "Tıp (TUS)" },
  { value: "dis", label: "Diş (DUS)" },
  { value: "hemsirelik", label: "Hemşirelik" },
  { value: "vet", label: "Veteriner" },
  { value: "saglik", label: "Sağlık (genel)" },
];

function openHtmlForPrint(html: string) {
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Yazdırma penceresi açılamadı (popup engelli olabilir).");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}

function downloadBase64Pdf(filename: string, base64: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const ALL = "__all__";

type TaxNode = { subject: string; topic: string };

/** Disipline göre public.qlinik_taxonomy'den branş + konu listesini çeker. */
function useTaxonomy(discipline: Discipline) {
  return useQuery({
    queryKey: ["pdf-taxonomy", discipline],
    queryFn: async () => {
      const r = await selectRows({
        schema: "public",
        table: "qlinik_taxonomy",
        select: "subject,topic",
        rawQuery: `discipline_code=eq.${discipline}&is_active=eq.true&order=sort_order,subject,topic`,
        limit: 2000,
      });
      return (r.data as JsonRow[]).map((n) => ({
        subject: String(n.subject ?? "").trim(),
        topic: String(n.topic ?? "").trim(),
      })) as TaxNode[];
    },
    staleTime: 5 * 60_000,
  });
}

type ProfileOpt = { id: string; name: string; email: string };

function displayName(u: JsonRow): string {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || String(u.email ?? u.id ?? "");
}

/** Kullanıcıyı public.profiles'tan sunucu-aramalı combobox ile seçtirir. */
function UserCombobox({
  value,
  onSelect,
}: {
  value: ProfileOpt | null;
  onSelect: (p: ProfileOpt | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["pdf-users", search],
    queryFn: async () => {
      const term = search.trim();
      const filter = term
        ? `or=(first_name.ilike.*${term}*,last_name.ilike.*${term}*,email.ilike.*${term}*)&`
        : "";
      const r = await selectRows({
        schema: "public",
        table: "profiles",
        select: "id,first_name,last_name,email",
        rawQuery: `${filter}order=created_at.desc`,
        limit: 25,
      });
      return (r.data as JsonRow[]).map((u) => ({
        id: String(u.id),
        name: displayName(u),
        email: String(u.email ?? ""),
      })) as ProfileOpt[];
    },
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">{value ? value.name : "Kullanıcı seç…"}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Ad, soyad veya e-posta…"
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {q.isLoading ? (
              <div className="py-4 text-center text-sm text-muted-foreground">Yükleniyor…</div>
            ) : (
              <CommandEmpty>Kullanıcı bulunamadı.</CommandEmpty>
            )}
            <CommandGroup>
              {value ? (
                <CommandItem
                  value="__clear__"
                  onSelect={() => {
                    onSelect(null);
                    setOpen(false);
                  }}
                  className="text-muted-foreground"
                >
                  Seçimi temizle
                </CommandItem>
              ) : null}
              {(q.data ?? []).map((u) => (
                <CommandItem
                  key={u.id}
                  value={u.id}
                  onSelect={() => {
                    onSelect(u);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn("mr-2 h-4 w-4", value?.id === u.id ? "opacity-100" : "opacity-0")}
                  />
                  <span className="flex flex-col">
                    <span className="text-sm">{u.name}</span>
                    {u.email ? (
                      <span className="text-xs text-muted-foreground">{u.email}</span>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function QuestionsExport() {
  const [discipline, setDiscipline] = useState<Discipline>("tip");
  const [subject, setSubject] = useState(ALL);
  const [topic, setTopic] = useState(ALL);
  const [difficulty, setDifficulty] = useState("all");
  const [limit, setLimit] = useState("50");
  const [withAnswers, setWithAnswers] = useState("1");
  const [user, setUser] = useState<ProfileOpt | null>(null);
  const [exam, setExam] = useState("");
  const [documentId, setDocumentId] = useState("");

  const tax = useTaxonomy(discipline);

  // Branş listesi (benzersiz) ve seçili branşa göre konu listesi.
  const subjects = useMemo(() => {
    const set = new Set<string>();
    for (const n of tax.data ?? []) if (n.subject) set.add(n.subject);
    return Array.from(set);
  }, [tax.data]);

  const topics = useMemo(() => {
    const set = new Set<string>();
    for (const n of tax.data ?? []) {
      if (!n.topic) continue;
      if (subject !== ALL && n.subject !== subject) continue;
      set.add(n.topic);
    }
    return Array.from(set);
  }, [tax.data, subject]);

  function changeDiscipline(v: Discipline) {
    setDiscipline(v);
    setSubject(ALL);
    setTopic(ALL);
  }
  function changeSubject(v: string) {
    setSubject(v);
    setTopic(ALL);
  }

  const mut = useMutation({
    mutationFn: (format: "pdf" | "html") =>
      qlinikPdfFn({
        data: {
          discipline,
          subject: subject === ALL ? undefined : subject,
          topic: topic === ALL ? undefined : topic,
          difficulty: difficulty === "all" ? undefined : difficulty,
          limit: Number(limit) || 50,
          withAnswers: withAnswers === "1",
          format,
          meta: {
            userName: user?.name || undefined,
            exam: exam.trim() || undefined,
            documentId:
              documentId.trim() || (user ? `QLK-${user.id.slice(0, 8).toUpperCase()}` : undefined),
          },
        },
      }),
    onSuccess: (res) => {
      if (res.questionCount === 0) {
        toast.error("Filtreye uygun soru bulunamadı.");
        return;
      }
      if (res.format === "pdf" && res.pdfBase64) {
        downloadBase64Pdf(res.filename, res.pdfBase64);
        toast.success(`${res.questionCount} soruluk PDF indirildi.`);
      } else if (res.html) {
        openHtmlForPrint(res.html);
        toast.success(`${res.questionCount} soru hazırlandı — yazdır penceresinden PDF kaydedin.`);
      }
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="Soru bankası çıktısı"
      description="public.questions → A4 2×3 kart şablonu (Qlinik / Medasi)"
    >
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Disiplin / Şablon">
          <Select value={discipline} onValueChange={(v) => changeDiscipline(v as Discipline)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISCIPLINES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Ders / Branş">
          <Select value={subject} onValueChange={changeSubject} disabled={tax.isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={tax.isLoading ? "Yükleniyor…" : "Tümü"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tümü</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Konu">
          <Select value={topic} onValueChange={setTopic} disabled={tax.isLoading}>
            <SelectTrigger>
              <SelectValue placeholder={tax.isLoading ? "Yükleniyor…" : "Tümü"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Tümü</SelectItem>
              {topics.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Zorluk">
          <Select value={difficulty} onValueChange={setDifficulty}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tümü</SelectItem>
              <SelectItem value="easy">Kolay</SelectItem>
              <SelectItem value="medium">Orta</SelectItem>
              <SelectItem value="hard">Zor</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Adet">
          <Input value={limit} onChange={(e) => setLimit(e.target.value)} inputMode="numeric" />
        </Field>
        <Field label="Cevap anahtarı">
          <Select value={withAnswers} onValueChange={setWithAnswers}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Dahil</SelectItem>
              <SelectItem value="0">Hariç</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <p className="mt-4 text-xs font-medium text-muted-foreground">
        Kişiye özel (header chip + filigran)
      </p>
      <div className="mt-1.5 grid gap-3 md:grid-cols-3">
        <Field label="Kullanıcı">
          <UserCombobox value={user} onSelect={setUser} />
        </Field>
        <Field label="Sınav">
          <Input value={exam} onChange={(e) => setExam(e.target.value)} placeholder="TUS / DUS …" />
        </Field>
        <Field label="Belge ID">
          <Input
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder={user ? `QLK-${user.id.slice(0, 8).toUpperCase()}` : "otomatik"}
          />
        </Field>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={mut.isPending} onClick={() => mut.mutate("pdf")}>
          {mut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Download className="mr-1.5 h-4 w-4" />
          )}{" "}
          PDF indir
        </Button>
        <Button variant="outline" disabled={mut.isPending} onClick={() => mut.mutate("html")}>
          <Printer className="mr-1.5 h-4 w-4" /> Önizle / Yazdır
        </Button>
      </div>
    </SectionCard>
  );
}

function CaseExport() {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<JsonRow[]>([]);

  const searchMut = useMutation({
    mutationFn: () =>
      selectRows({
        schema: "praticase",
        table: "cases",
        select: "id,title,branch",
        rawQuery: `title=ilike.*${search.trim()}*&order=created_at.desc`,
        limit: 25,
      }).then((r) => r.data),
    onSuccess: (r) => setResults(r),
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const printMut = useMutation({
    mutationFn: (id: string) =>
      selectRows({ schema: "praticase", table: "cases", rawQuery: `id=eq.${id}`, limit: 1 }).then(
        (r) => r.data[0],
      ),
    onSuccess: (c) => {
      if (!c) {
        toast.error("Vaka bulunamadı.");
        return;
      }
      const fields = [
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
      ];
      const body = fields
        .filter((f) => c[f] != null)
        .map((f) => {
          const v = c[f];
          const text =
            typeof v === "string" ? esc(v) : `<pre>${esc(JSON.stringify(v, null, 2))}</pre>`;
          return `<div class="field"><h3>${f}</h3>${typeof v === "string" ? `<div>${text}</div>` : text}</div>`;
        })
        .join("");
      printHtml(
        String(c.title ?? "Vaka"),
        `<h1>${esc(c.title)}</h1><div class="meta">${esc(c.branch)} · ${esc(c.difficulty)} · ${esc(c.points)} puan</div>${body}`,
      );
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard title="Vaka çıktısı" description="praticase.cases">
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Vaka başlığı ara…"
          className="max-w-sm"
          onKeyDown={(e) => e.key === "Enter" && searchMut.mutate()}
        />
        <Button variant="outline" disabled={searchMut.isPending} onClick={() => searchMut.mutate()}>
          {searchMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Search className="h-4 w-4" />
          )}
        </Button>
      </div>
      <div className="mt-3 space-y-1">
        {results.map((c) => (
          <div
            key={String(c.id)}
            className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
          >
            <div>
              <span className="text-sm font-medium">{String(c.title)}</span>{" "}
              <Badge variant="outline" className="ml-1">
                {String(c.branch ?? "")}
              </Badge>
            </div>
            <Button
              size="sm"
              variant="secondary"
              disabled={printMut.isPending}
              onClick={() => printMut.mutate(String(c.id))}
            >
              <Printer className="mr-1.5 h-4 w-4" /> Yazdır
            </Button>
          </div>
        ))}
      </div>
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
