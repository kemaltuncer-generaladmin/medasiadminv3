import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSearch, Loader2 } from "lucide-react";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { selectRows, type JsonRow } from "@/lib/supabase-rest";
import { fmtDate } from "@/lib/format";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<JsonRow | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "admin_action_logs",
        rawQuery: "order=created_at.desc",
        limit: 300,
      }),
    retry: false,
  });

  const rows = data?.data ?? [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.action, r.target_table, r.target_id, r.reason].some((f) =>
        String(f ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [rows, search]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Denetim Kaydı"
        description="public.admin_action_logs · kim / ne zaman / ne (before-after)"
        icon={FileSearch}
      />
      <SectionCard title="Son aksiyonlar">
        <div className="mb-3 flex items-center gap-2">
          <Input
            placeholder="Aksiyon, tablo, target, sebep…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : error ? (
          <div className="py-6 text-sm text-destructive">
            {String((error as Error).message).slice(0, 200)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">Kayıt yok.</div>
        ) : (
          <div className="max-h-[640px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Aksiyon</TableHead>
                  <TableHead>Tablo</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Sebep</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => (
                  <TableRow
                    key={String(r.id)}
                    className="cursor-pointer"
                    onClick={() => setSelected(r)}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {fmtDate(r.created_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{String(r.action ?? "—")}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {String(r.target_table ?? "—")}
                    </TableCell>
                    <TableCell className="max-w-32 truncate font-mono text-xs">
                      {String(r.target_id ?? "—")}
                    </TableCell>
                    <TableCell className="max-w-sm truncate text-xs">
                      {String(r.reason ?? "—")}
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
                <SheetTitle>{String(selected.action ?? "işlem")}</SheetTitle>
                <SheetDescription>
                  {fmtDate(selected.created_at)} · {String(selected.target_table ?? "—")}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-4">
                <SectionCard title="Özet">
                  <dl className="divide-y text-sm">
                    <KV
                      k="Actor"
                      v={String(selected.actor_user_id ?? selected.admin_user_id ?? "—")}
                      mono
                    />
                    <KV k="Target ID" v={String(selected.target_id ?? "—")} mono />
                    <KV k="Target user" v={String(selected.target_user_id ?? "—")} mono />
                    <KV k="Sebep" v={String(selected.reason ?? "—")} />
                  </dl>
                </SectionCard>
                <JsonCard
                  title="Before"
                  value={selected.before ?? (selected.before_state as JsonRow)}
                />
                <JsonCard
                  title="After"
                  value={selected.after ?? (selected.after_state as JsonRow)}
                />
                <JsonCard title="Metadata" value={selected.metadata} />
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function JsonCard({ title, value }: { title: string; value: unknown }) {
  if (value == null) return null;
  let text: string;
  try {
    text = JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (text === "null" || text === "{}" || text === "") return null;
  return (
    <SectionCard title={title}>
      <pre className="max-h-72 overflow-auto rounded bg-muted/40 p-3 font-mono text-[11px]">
        {text}
      </pre>
    </SectionCard>
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
