import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Database, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { KpiCard, SectionCard, StatusBadge } from "@/components/admin/shared";
import { countRows, pageRows, selectRows, type JsonRow } from "@/lib/supabase-rest";
import type { AdminSchema } from "@/lib/admin-config";

type RowColumn = {
  key: string;
  label?: string;
  className?: string;
  render?: (row: JsonRow) => React.ReactNode;
};

export type LiveTableConfig = {
  title: string;
  description?: string;
  schema: AdminSchema;
  table: string;
  select?: string;
  rawQuery?: string;
  order?: string;
  ascending?: boolean;
  limit?: number;
  columns?: RowColumn[];
};

export function LiveTableCard(config: LiveTableConfig) {
  const limit = config.limit ?? 25;
  const query = useQuery({
    queryKey: [
      "live-table",
      config.schema,
      config.table,
      config.select,
      config.rawQuery,
      config.order,
      config.ascending,
      limit,
    ],
    queryFn: () =>
      pageRows({
        schema: config.schema,
        table: config.table,
        select: config.select,
        rawQuery: config.rawQuery,
        order: config.order,
        ascending: config.ascending,
        limit,
      }),
    retry: false,
  });

  const rows = query.data?.data ?? [];
  const columns = useMemo<RowColumn[]>(() => {
    if (config.columns?.length) return config.columns;
    return Array.from(new Set(rows.flatMap((row) => Object.keys(row))))
      .slice(0, 8)
      .map((key) => ({ key }));
  }, [config.columns, rows]);

  return (
    <SectionCard
      title={config.title}
      description={config.description}
      actions={
        <Badge variant="outline">
          {config.schema}.{config.table}
        </Badge>
      }
    >
      {query.isLoading || query.isFetching ? (
        <LoadingLine />
      ) : query.error ? (
        <ErrorLine error={query.error} />
      ) : rows.length === 0 ? (
        <EmptyLine />
      ) : (
        <div className="overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key}>{column.label ?? column.key}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, index) => (
                <TableRow key={String(row.id ?? row.uuid ?? `${config.table}-${index}`)}>
                  {columns.map((column) => (
                    <TableCell
                      key={column.key}
                      className={column.className ?? "max-w-72 truncate text-xs"}
                    >
                      {column.render ? column.render(row) : formatCell(row[column.key])}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </SectionCard>
  );
}

export function CountKpiCard({
  label,
  schema,
  table,
  rawQuery = "",
  tone,
  hint,
}: {
  label: string;
  schema: AdminSchema;
  table: string;
  rawQuery?: string;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  hint?: string;
}) {
  const query = useQuery({
    queryKey: ["count-kpi", schema, table, rawQuery],
    queryFn: () => countRows(schema, table, rawQuery),
    retry: false,
  });

  return (
    <KpiCard
      label={label}
      value={query.isLoading ? "..." : query.error ? "!" : formatNumber(query.data ?? 0)}
      hint={query.error ? compactError(query.error) : hint}
      tone={query.error ? "destructive" : tone}
    />
  );
}

export function AggregateKpiCard({
  label,
  schema,
  table,
  select,
  rawQuery = "",
  limit = 5000,
  compute,
  tone,
  hint,
}: {
  label: string;
  schema: AdminSchema;
  table: string;
  select?: string;
  rawQuery?: string;
  limit?: number;
  compute: (rows: JsonRow[]) => string | number;
  tone?: "default" | "success" | "warning" | "destructive" | "info";
  hint?: string;
}) {
  const query = useQuery({
    queryKey: ["aggregate-kpi", schema, table, select, rawQuery, limit],
    queryFn: () => selectRows({ schema, table, select, rawQuery, limit }),
    retry: false,
  });

  return (
    <KpiCard
      label={label}
      value={query.isLoading ? "..." : query.error ? "!" : compute(query.data?.data ?? [])}
      hint={query.error ? compactError(query.error) : hint}
      tone={query.error ? "destructive" : tone}
    />
  );
}

export function StatusCountStrip({
  schema,
  table,
  statusColumn = "status",
  statuses,
}: {
  schema: AdminSchema;
  table: string;
  statusColumn?: string;
  statuses: string[];
}) {
  const query = useQuery({
    queryKey: ["status-strip", schema, table, statusColumn, statuses],
    queryFn: async () => {
      const entries = await Promise.all(
        statuses.map(
          async (status) =>
            [status, await countRows(schema, table, `${statusColumn}=eq.${status}`)] as const,
        ),
      );
      return Object.fromEntries(entries) as Record<string, number>;
    },
    retry: false,
  });

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6">
      {statuses.map((status) => (
        <div key={status} className="rounded-lg border bg-card p-3">
          <div className="mb-2">
            <StatusBadge status={status} />
          </div>
          <div className="text-2xl font-semibold tabular-nums">
            {query.isLoading ? "..." : query.error ? "!" : formatNumber(query.data?.[status] ?? 0)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RefreshButton({ onClick, loading }: { onClick: () => void; loading?: boolean }) {
  return (
    <Button variant="outline" size="sm" onClick={onClick} disabled={loading}>
      {loading ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Database className="mr-1.5 h-4 w-4" />
      )}
      Yenile
    </Button>
  );
}

export function formatCell(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number")
    return Number.isInteger(value)
      ? formatNumber(value)
      : value.toLocaleString("tr-TR", { maximumFractionDigits: 4 });
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function moneyFromCents(cents: unknown) {
  const value = Number(cents ?? 0) / 100;
  return value.toLocaleString("tr-TR", { style: "currency", currency: "TRY" });
}

export function numberValue(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

export function formatNumber(value: number) {
  return value.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

function LoadingLine() {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Canlı veri yükleniyor...
    </div>
  );
}

function EmptyLine() {
  return <div className="text-sm text-muted-foreground">Kayıt bulunamadı.</div>;
}

function ErrorLine({ error }: { error: unknown }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="line-clamp-3">{compactError(error)}</span>
    </div>
  );
}

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : "Sorgu çalıştırılamadı.";
  return message.replace(/\s+/g, " ").slice(0, 180);
}
