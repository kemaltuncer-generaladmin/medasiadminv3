import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Stethoscope, Loader2, Plus, MoreVertical, Sparkles } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  selectRows,
  auditedInsert,
  auditedUpdate,
  auditedDelete,
  updateRow,
  type JsonRow,
} from "@/lib/supabase-rest";
import { numberValue } from "@/components/admin/live-data";
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/_authenticated/admin/vakalar")({
  component: Vakalar,
});

const SCHEMA = "praticase" as const;
const DIFFICULTIES = ["Kolay", "Orta", "Zor"];

const CONTENT_FIELDS = [
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
  "flow_steps",
  "goals",
];
const TEXT_FIELDS = new Set(["candidate_prompt", "summary"]);

type Health = { status: string; missing: string[] };

function healthBadge(h: Health | undefined) {
  if (!h) return { text: "—", tone: "gray" as const };
  switch (h.status) {
    case "healthy":
      return { text: "Tam içerik", tone: "green" as const };
    case "draft_incomplete":
      return {
        text: h.missing.length ? `Eksik (${h.missing.length})` : "Eksik",
        tone: "amber" as const,
      };
    case "legacy_content":
      return { text: "Legacy", tone: "gray" as const };
    default:
      return { text: h.status, tone: "blue" as const };
  }
}

function Vakalar() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<JsonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [contentEditing, setContentEditing] = useState<JsonRow | null>(null);

  const casesQ = useQuery({
    queryKey: ["cases"],
    queryFn: () =>
      selectRows({ schema: SCHEMA, table: "cases", rawQuery: "order=created_at.desc", limit: 500 }),
    retry: false,
  });
  const healthQ = useQuery({
    queryKey: ["cases", "health"],
    queryFn: () =>
      selectRows({
        schema: SCHEMA,
        table: "god_mode_case_publication_v",
        rawQuery: "order=updated_at.desc",
        limit: 1000,
      }),
    retry: false,
  });

  const cases = casesQ.data?.data ?? [];
  const healthMap = useMemo(() => {
    const map = new Map<string, Health>();
    for (const row of healthQ.data?.data ?? []) {
      const id = String(row.case_id ?? "");
      if (!id) continue;
      const missing = Array.isArray(row.missing_content_types)
        ? (row.missing_content_types as unknown[]).map(String)
        : [];
      map.set(id, { status: String(row.health_status ?? "unknown"), missing });
    }
    return map;
  }, [healthQ.data]);

  const healthyCount = Array.from(healthMap.values()).filter((h) => h.status === "healthy").length;
  const incompleteCount = Array.from(healthMap.values()).filter(
    (h) => h.status === "draft_incomplete",
  ).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter((c) =>
      [c.title, c.branch].some((f) =>
        String(f ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [cases, search]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["cases"] });
  };

  const publishMut = useMutation({
    mutationFn: ({ c, next }: { c: JsonRow; next: boolean }) =>
      auditedUpdate({
        schema: SCHEMA,
        table: "cases",
        id: String(c.id),
        fields: { is_published: next },
        action: next ? "publish_case" : "unpublish_case",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (c: JsonRow) =>
      auditedDelete({ schema: SCHEMA, table: "cases", id: String(c.id), action: "delete_case" }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const subtitle = `PratiCase • ${cases.length} vaka • ${healthyCount} tam içerik${incompleteCount > 0 ? ` • ${incompleteCount} eksik` : ""}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Vakalar"
        description={subtitle}
        icon={Stethoscope}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Yeni Vaka
          </Button>
        }
      />

      <SectionCard title="Vakalar" description="praticase.cases + god_mode_case_publication_v">
        <div className="mb-3 flex items-center gap-2">
          <Input
            placeholder="Başlık / branş…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>

        {casesQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : casesQ.error ? (
          <div className="py-6 text-sm text-destructive">
            {String((casesQ.error as Error).message).slice(0, 200)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">Vaka bulunamadı.</div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Vaka</TableHead>
                  <TableHead>İçerik sağlığı</TableHead>
                  <TableHead className="text-right">Puan</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const h = healthMap.get(String(c.id));
                  const badge = healthBadge(h);
                  return (
                    <TableRow
                      key={String(c.id)}
                      className="cursor-pointer"
                      onClick={() => setEditing(c)}
                    >
                      <TableCell>
                        <div className="text-sm font-medium">{String(c.title ?? "—")}</div>
                        <div className="mt-0.5 flex gap-1">
                          {c.branch ? (
                            <Badge
                              variant="outline"
                              className="border-violet-400/40 bg-violet-400/10 text-violet-500"
                            >
                              {String(c.branch)}
                            </Badge>
                          ) : null}
                          {c.difficulty ? (
                            <Badge variant="outline">{String(c.difficulty)}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <HealthPill badge={badge} />
                        {h && h.missing.length > 0 ? (
                          <div className="mt-0.5 line-clamp-1 text-[10px] text-warning">
                            Eksik: {h.missing.join(", ")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm font-bold text-warning">
                        {numberValue(c.points)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={(c.is_published ?? false) ? "published" : "draft"} />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setEditing(c)}>
                              Düzenle (temel)
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setContentEditing(c)}>
                              İçerik Düzenle (JSON)
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() =>
                                publishMut.mutate({ c, next: !(c.is_published ?? false) })
                              }
                            >
                              {(c.is_published ?? false) ? "Yayından kaldır" : "Yayınla"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMut.mutate(c)}
                            >
                              Sil
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <CaseEditor open={creating} onOpenChange={setCreating} item={null} onSaved={invalidate} />
      <CaseEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        item={editing}
        onSaved={invalidate}
      />
      <CaseContentEditor
        caseRow={contentEditing}
        onOpenChange={(o) => !o && setContentEditing(null)}
      />
    </div>
  );
}

function HealthPill({
  badge,
}: {
  badge: { text: string; tone: "green" | "amber" | "gray" | "blue" };
}) {
  const cls = {
    green: "border-success/30 bg-success/15 text-success",
    amber: "border-warning/30 bg-warning/15 text-warning",
    gray: "border-border bg-muted text-muted-foreground",
    blue: "border-info/30 bg-info/15 text-info",
  }[badge.tone];
  return (
    <Badge variant="outline" className={cls}>
      {badge.text}
    </Badge>
  );
}

function CaseEditor({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: JsonRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = !item;
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [branch, setBranch] = useState("");
  const [difficulty, setDifficulty] = useState("Orta");
  const [duration, setDuration] = useState("20");
  const [setting, setSetting] = useState("Poliklinik");
  const [candidatePrompt, setCandidatePrompt] = useState("");
  const [points, setPoints] = useState("100");
  const [published, setPublished] = useState(false);

  useEffect(() => {
    if (open) {
      setTitle(String(item?.title ?? ""));
      setSlug(String(item?.slug ?? ""));
      setBranch(String(item?.branch ?? ""));
      setDifficulty(String(item?.difficulty ?? "Orta"));
      setDuration(String(numberValue(item?.duration_minutes) || 20));
      setSetting(String(item?.setting ?? "Poliklinik"));
      setCandidatePrompt("");
      setPoints(String(numberValue(item?.points) || 100));
      setPublished(Boolean(item?.is_published ?? false));
    }
  }, [open, item]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (item) {
        return auditedUpdate({
          schema: SCHEMA,
          table: "cases",
          id: String(item.id),
          fields: {
            title,
            branch,
            difficulty,
            duration_minutes: Number(duration) || 20,
            setting,
            points: Number(points) || 0,
            is_published: published,
          },
          action: "update_case",
        });
      }
      return auditedInsert({
        schema: SCHEMA,
        table: "cases",
        values: {
          slug,
          title,
          branch,
          difficulty,
          duration_minutes: Number(duration) || 20,
          setting,
          candidate_prompt: candidatePrompt || title,
          points: Number(points) || 0,
          is_published: published,
        },
        action: "create_case",
      });
    },
    onSuccess: () => {
      toast.success(isNew ? "Vaka oluşturuldu" : "Kaydedildi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Yeni Vaka" : "Vakayı Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Başlık">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          {isNew ? (
            <Field label="Slug (benzersiz)">
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" />
            </Field>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Branş">
              <Input value={branch} onChange={(e) => setBranch(e.target.value)} />
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
          <div className="grid grid-cols-3 gap-3">
            <Field label="Süre (dk)">
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Ortam">
              <Input value={setting} onChange={(e) => setSetting(e.target.value)} />
            </Field>
            <Field label="Puan">
              <Input
                value={points}
                onChange={(e) => setPoints(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          {isNew ? (
            <Field label="Aday yönergesi (candidate_prompt)">
              <Textarea
                value={candidatePrompt}
                onChange={(e) => setCandidatePrompt(e.target.value)}
                rows={2}
              />
            </Field>
          ) : null}
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">Yayınlandı</Label>
            <Switch checked={published} onCheckedChange={setPublished} />
          </div>
          {isNew ? (
            <Button asChild variant="secondary" className="w-full">
              <Link to="/admin/vaka-uretim">
                <Sparkles className="mr-1.5 h-4 w-4" /> AI ile Üret ve Canlıya Al
              </Link>
            </Button>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            disabled={!title.trim() || (isNew && !slug.trim()) || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{" "}
            {isNew ? "Oluştur" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function toEditable(value: unknown, field: string): string {
  if (TEXT_FIELDS.has(field)) return value == null ? "" : String(value);
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function CaseContentEditor({
  caseRow,
  onOpenChange,
}: {
  caseRow: JsonRow | null;
  onOpenChange: (o: boolean) => void;
}) {
  const open = caseRow !== null;
  const caseId = caseRow ? String(caseRow.id) : "";
  const [selected, setSelected] = useState("patient_profile");
  const [original, setOriginal] = useState<Record<string, string>>({});
  const [text, setText] = useState<Record<string, string>>({});

  const rowQ = useQuery({
    queryKey: ["case-content", caseId],
    queryFn: () =>
      selectRows({ schema: SCHEMA, table: "cases", rawQuery: `id=eq.${caseId}`, limit: 1 }),
    enabled: open,
    retry: false,
  });

  useEffect(() => {
    const row = rowQ.data?.data?.[0];
    if (!row) return;
    const next: Record<string, string> = {};
    for (const f of CONTENT_FIELDS) next[f] = toEditable(row[f], f);
    setOriginal(next);
    setText(next);
  }, [rowQ.data]);

  const changed = (f: string) => (text[f] ?? "") !== (original[f] ?? "");
  const changedFields = CONTENT_FIELDS.filter(changed);

  const saveMut = useMutation({
    mutationFn: async () => {
      const fields: JsonRow = {};
      for (const f of changedFields) {
        const raw = text[f] ?? "";
        if (TEXT_FIELDS.has(f)) {
          fields[f] = raw === "" ? null : raw;
        } else {
          if (raw.trim() === "") {
            fields[f] = null;
            continue;
          }
          try {
            fields[f] = JSON.parse(raw);
          } catch {
            throw new Error(`${f}: geçersiz JSON`);
          }
        }
      }
      if (Object.keys(fields).length === 0) throw new Error("Değişiklik yok.");
      await updateRow({ schema: SCHEMA, table: "cases", id: caseId, fields });
      return Object.keys(fields).length;
    },
    onSuccess: (n) => {
      toast.success(`${n} alan kaydedildi`);
      rowQ.refetch();
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Vaka İçeriği — JSON</DialogTitle>
          <p className="text-xs text-muted-foreground">{String(caseRow?.title ?? "")}</p>
        </DialogHeader>

        {rowQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : (
          <div className="space-y-3">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="w-72">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONTENT_FIELDS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                    {changed(f) ? " ●" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              value={text[selected] ?? ""}
              onChange={(e) => setText((t) => ({ ...t, [selected]: e.target.value }))}
              className="min-h-80 font-mono text-xs"
            />
            <p className="text-[11px] text-muted-foreground">
              Her alan ayrı kaydedilebilir; ● işareti değişen alanı gösterir.{" "}
              {TEXT_FIELDS.has(selected) ? "Bu alan düz metindir." : "Geçersiz JSON kaydedilmez."}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Kapat
          </Button>
          <Button
            disabled={changedFields.length === 0 || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Değişenleri
            Kaydet{changedFields.length ? ` (${changedFields.length})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
