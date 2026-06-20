import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard,
  Users,
  LifeBuoy,
  ListChecks,
  Receipt,
  Heart,
  FileSearch,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import {
  AggregateKpiCard,
  CountKpiCard,
  LiveTableCard,
  formatCell,
  formatNumber,
  numberValue,
} from "@/components/admin/live-data";
import { selectRows, countRows } from "@/lib/supabase-rest";
import { fmtRelative } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/genel-bakis")({
  component: GenelBakis,
});

const ALERTS = [
  {
    label: "Açık destek",
    schema: "sourcebase" as const,
    table: "support_tickets",
    rawQuery: "status=neq.resolved",
    to: "/admin/destek",
    icon: LifeBuoy,
    tone: "warning" as const,
  },
  {
    label: "İletişim talebi",
    schema: "praticase" as const,
    table: "contact_requests",
    rawQuery: "status=neq.resolved",
    to: "/admin/destek",
    icon: LifeBuoy,
    tone: "warning" as const,
  },
  {
    label: "Failed job",
    schema: "sourcebase" as const,
    table: "generated_jobs",
    rawQuery: "status=eq.failed",
    to: "/admin/job-queue",
    icon: ListChecks,
    tone: "destructive" as const,
  },
  {
    label: "Onay bekleyen ödeme",
    schema: "public" as const,
    table: "purchases",
    rawQuery: "status=in.(receipt_uploaded,review)",
    to: "/admin/medasipay",
    icon: Receipt,
    tone: "warning" as const,
  },
  {
    label: "İçerik sorunu",
    schema: "praticase" as const,
    table: "god_mode_content_health_v",
    rawQuery: "health_status=neq.healthy",
    to: "/admin/icerik-sagligi",
    icon: Heart,
    tone: "destructive" as const,
  },
];

function GenelBakis() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Komuta Merkezi"
        description="Canlı operasyon nabzı • tıklanabilir uyarılar"
        icon={LayoutDashboard}
      />

      {/* Ops alerts — clickable */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        {ALERTS.map((a) => (
          <AlertCard key={a.label + a.to} {...a} />
        ))}
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        <CountKpiCard label="Toplam kullanıcı" schema="public" table="profiles" />
        <CountKpiCard
          label="Aktif admin"
          schema="public"
          table="profiles"
          rawQuery="is_admin=eq.true"
          tone="info"
        />
        <AggregateKpiCard
          label="Dolaşımdaki MC"
          schema="public"
          table="profiles"
          select="id,wallet_balance"
          compute={(rows) =>
            formatNumber(rows.reduce((s, r) => s + numberValue(r.wallet_balance), 0))
          }
          tone="success"
        />
        <CountKpiCard
          label="Aktif entitlement"
          schema="public"
          table="wallet_entitlements"
          rawQuery="status=eq.active"
        />
        <CountKpiCard label="Qlinik soru" schema="public" table="questions" />
        <CountKpiCard label="KamuBase soru" schema="kamubase" table="questions" />
        <CountKpiCard label="PratiCase vaka" schema="praticase" table="cases" />
        <CountKpiCard label="SourceBase ürün" schema="sourcebase" table="products" />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SignupChart />
        <AuditFeed />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="Son kayıt olan kullanıcılar"
          schema="public"
          table="profiles"
          select="id,email,first_name,last_name,wallet_balance,is_admin,created_at"
          order="created_at"
          limit={8}
          columns={[
            { key: "email", label: "E-posta" },
            { key: "first_name", label: "Ad" },
            { key: "wallet_balance", label: "MC" },
            { key: "created_at", label: "Kayıt" },
          ]}
        />
        <LiveTableCard
          title="Son failed jobs"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.failed"
          order="created_at"
          limit={8}
          columns={[
            { key: "id", label: "Job", className: "max-w-44 truncate font-mono text-xs" },
            { key: "type", label: "Tip" },
            {
              key: "error",
              label: "Hata",
              render: (row) => formatCell(row.error ?? row.error_message ?? row.last_error),
            },
            { key: "created_at", label: "Tarih" },
          ]}
        />
      </div>
    </div>
  );
}

function AlertCard({
  label,
  schema,
  table,
  rawQuery,
  to,
  icon: Icon,
  tone,
}: (typeof ALERTS)[number]) {
  const q = useQuery({
    queryKey: ["alert", schema, table, rawQuery],
    queryFn: () => countRows(schema, table, rawQuery),
    retry: false,
  });
  const count = q.data ?? 0;
  const toneCls = q.error
    ? "text-destructive"
    : count > 0
      ? tone === "destructive"
        ? "text-destructive"
        : "text-warning"
      : "text-muted-foreground";
  return (
    <Link to={to} className="rounded-lg border bg-card p-3 transition hover:bg-accent">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" /> {label}
      </div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${toneCls}`}>
        {q.isLoading ? "…" : q.error ? "!" : formatNumber(count)}
      </div>
    </Link>
  );
}

function SignupChart() {
  const q = useQuery({
    queryKey: ["signup-chart"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "profiles",
        select: "id,created_at",
        rawQuery: "order=created_at.desc",
        limit: 4000,
      }),
    retry: false,
  });
  const data = useMemo(() => {
    const map = new Map<string, number>();
    const now = Date.now();
    for (const r of q.data?.data ?? []) {
      const d = new Date(String(r.created_at));
      if (Number.isNaN(d.getTime())) continue;
      if (now - d.getTime() > 30 * 86400000) continue;
      const key = d.toISOString().slice(0, 10);
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, count]) => ({ day: day.slice(5), count }));
  }, [q.data]);

  return (
    <SectionCard title="Yeni Kayıtlar" description="Son 30 gün">
      {q.isLoading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Yükleniyor…</div>
      ) : data.length === 0 ? (
        <div className="py-12 text-center text-sm text-muted-foreground">Veri yok.</div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
            <XAxis dataKey="day" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} name="Kayıt" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </SectionCard>
  );
}

function AuditFeed() {
  const q = useQuery({
    queryKey: ["dash-audit"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "admin_action_logs",
        rawQuery: "order=created_at.desc",
        limit: 12,
      }),
    retry: false,
  });
  const rows = q.data?.data ?? [];
  return (
    <SectionCard
      title="Son İşlemler (denetim)"
      description="admin_action_logs"
      actions={
        <Link to="/admin/audit" className="text-xs text-primary hover:underline">
          <FileSearch className="mr-1 inline h-3 w-3" />
          Tümü
        </Link>
      }
    >
      {q.isLoading ? (
        <div className="py-8 text-sm text-muted-foreground">Yükleniyor…</div>
      ) : rows.length === 0 ? (
        <div className="py-8 text-sm text-muted-foreground">Kayıt yok.</div>
      ) : (
        <ol className="space-y-2">
          {rows.map((r) => (
            <li key={String(r.id)} className="flex items-center justify-between gap-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <Users className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  <span className="font-medium">{String(r.action ?? "işlem")}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {String(r.target_table ?? "")}
                  </span>
                </span>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">
                {fmtRelative(r.created_at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </SectionCard>
  );
}
