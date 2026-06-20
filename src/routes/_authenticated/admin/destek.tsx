import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { LifeBuoy, Loader2 } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, KpiCard } from "@/components/admin/shared";
import { selectRows, auditedUpdate, type JsonRow } from "@/lib/supabase-rest";
import type { AdminSchema } from "@/lib/admin-config";
import { fmtDate, fmtRelative } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/destek")({
  component: Destek,
});

type SupportItem = {
  id: string;
  source: "ticket" | "contact";
  sourceLabel: string;
  schema: AdminSchema;
  table: string;
  title: string;
  email: string | null;
  message: string | null;
  status: string;
  userId: string | null;
  createdAt: string | null;
};

const WORKFLOW = ["open", "in_progress", "resolved"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Açık",
  in_progress: "İşlemde",
  resolved: "Çözüldü",
  closed: "Kapalı",
};

function normStatus(s: unknown) {
  const v = String(s ?? "").trim();
  return v || "open";
}

function Destek() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [selected, setSelected] = useState<SupportItem | null>(null);

  const ticketsQ = useQuery({
    queryKey: ["support", "tickets"],
    queryFn: () =>
      selectRows({
        schema: "sourcebase",
        table: "support_tickets",
        rawQuery: "order=created_at.desc",
        limit: 500,
      }),
    retry: false,
  });
  const contactsQ = useQuery({
    queryKey: ["support", "contacts"],
    queryFn: () =>
      selectRows({
        schema: "praticase",
        table: "contact_requests",
        rawQuery: "order=created_at.desc",
        limit: 500,
      }),
    retry: false,
  });

  const items = useMemo<SupportItem[]>(() => {
    const tickets = (ticketsQ.data?.data ?? []).map<SupportItem>((t) => ({
      id: String(t.id),
      source: "ticket",
      sourceLabel: "Destek",
      schema: "sourcebase",
      table: "support_tickets",
      title: String(t.topic ?? "Destek"),
      email: (t.email as string) ?? null,
      message: (t.message as string) ?? null,
      status: normStatus(t.status),
      userId: (t.owner_user_id as string) ?? null,
      createdAt: (t.created_at as string) ?? null,
    }));
    const contacts = (contactsQ.data?.data ?? []).map<SupportItem>((c) => ({
      id: String(c.id),
      source: "contact",
      sourceLabel: "İletişim",
      schema: "praticase",
      table: "contact_requests",
      title: String(c.subject ?? "İletişim"),
      email: (c.email as string) ?? null,
      message: (c.message as string) ?? null,
      status: normStatus(c.status),
      userId: (c.user_id as string) ?? null,
      createdAt: (c.created_at as string) ?? null,
    }));
    return [...tickets, ...contacts].sort((a, b) =>
      (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
    );
  }, [ticketsQ.data, contactsQ.data]);

  const count = (s: string) => items.filter((i) => i.status === s).length;
  const openCount = items.filter((i) => i.status !== "resolved" && i.status !== "closed").length;
  const statuses = Array.from(new Set(items.map((i) => i.status))).sort();

  const filtered = useMemo(() => {
    let rows = items;
    if (statusFilter) rows = rows.filter((i) => i.status === statusFilter);
    if (sourceFilter) rows = rows.filter((i) => i.sourceLabel === sourceFilter);
    const q = search.trim().toLowerCase();
    if (q)
      rows = rows.filter((i) =>
        [i.title, i.email, i.message].some((f) =>
          String(f ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    return rows;
  }, [items, statusFilter, sourceFilter, search]);

  const statusMut = useMutation({
    mutationFn: async ({ item, status }: { item: SupportItem; status: string }) => {
      await auditedUpdate({
        schema: item.schema,
        table: item.table,
        id: item.id,
        fields: { status },
        action: `support_status_${status}`,
        targetUserId: item.userId ?? undefined,
      });
      return status;
    },
    onSuccess: (status, { item }) => {
      qc.invalidateQueries({ queryKey: ["support"] });
      setSelected((cur) => (cur && cur.id === item.id ? { ...cur, status } : cur));
      toast.success(`Durum güncellendi: ${STATUS_LABEL[status] ?? status}`);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const loading = ticketsQ.isLoading || contactsQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Destek Kutusu"
        description={`${openCount} açık talep • support_tickets + contact_requests`}
        icon={LifeBuoy}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => qc.invalidateQueries({ queryKey: ["support"] })}
          >
            Yenile
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Açık" value={loading ? "…" : count("open")} tone="info" />
        <KpiCard label="İşlemde" value={loading ? "…" : count("in_progress")} tone="warning" />
        <KpiCard label="Çözüldü" value={loading ? "…" : count("resolved")} tone="success" />
        <KpiCard label="Toplam" value={loading ? "…" : items.length} />
      </div>

      <SectionCard title="Talepler">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Konu, e-posta, mesaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Select
            value={statusFilter || "__all"}
            onValueChange={(v) => setStatusFilter(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-40">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tüm durumlar</SelectItem>
              {statuses.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABEL[s] ?? s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={sourceFilter || "__all"}
            onValueChange={(v) => setSourceFilter(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-36">
              <SelectValue placeholder="Kaynak" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tüm kaynaklar</SelectItem>
              <SelectItem value="Destek">Destek</SelectItem>
              <SelectItem value="İletişim">İletişim</SelectItem>
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">Kayıt bulunamadı.</div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Kaynak</TableHead>
                  <TableHead>Konu</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((i) => (
                  <TableRow
                    key={`${i.source}-${i.id}`}
                    className="cursor-pointer"
                    onClick={() => setSelected(i)}
                  >
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          i.source === "ticket"
                            ? "border-info/40 bg-info/10 text-info"
                            : "border-violet-400/40 bg-violet-400/10 text-violet-500"
                        }
                      >
                        {i.sourceLabel}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-medium">{i.title}</div>
                      <div className="text-xs text-muted-foreground">{i.email ?? "—"}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={STATUS_LABEL[i.status] ?? i.status} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtRelative(i.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected ? (
            <>
              <SheetHeader className="mb-4">
                <SheetTitle>{selected.title}</SheetTitle>
                <SheetDescription>
                  {selected.sourceLabel} • {fmtDate(selected.createdAt)}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5">
                <SectionCard title="Durum">
                  <div className="flex gap-2">
                    {WORKFLOW.map((s) => (
                      <button
                        key={s}
                        disabled={statusMut.isPending}
                        onClick={() => statusMut.mutate({ item: selected, status: s })}
                        className={cn(
                          "flex-1 rounded-md py-2 text-xs font-semibold transition",
                          selected.status === s
                            ? s === "resolved"
                              ? "bg-success text-success-foreground"
                              : s === "in_progress"
                                ? "bg-warning text-warning-foreground"
                                : "bg-info text-info-foreground"
                            : "bg-muted text-muted-foreground hover:bg-muted/70",
                        )}
                      >
                        {STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard title="Talep">
                  <dl className="divide-y text-sm">
                    <KV k="E-posta" v={selected.email ?? "—"} />
                    <KV k="Kullanıcı" v={selected.userId ?? "—"} mono />
                    <KV k="Kaynak tablo" v={`${selected.schema}.${selected.table}`} mono />
                  </dl>
                </SectionCard>

                <SectionCard title="Mesaj">
                  <p className="whitespace-pre-wrap text-sm">{selected.message?.trim() || "—"}</p>
                </SectionCard>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate text-right"}>{v}</dd>
    </div>
  );
}
