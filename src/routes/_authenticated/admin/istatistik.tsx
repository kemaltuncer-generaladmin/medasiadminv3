import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Loader2 } from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PageHeader, SectionCard, KpiCard } from "@/components/admin/shared";
import { selectRows, type JsonRow } from "@/lib/supabase-rest";
import { numberValue, formatNumber } from "@/components/admin/live-data";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/istatistik")({
  component: Istatistik,
});

function Istatistik() {
  const funnelQ = useQuery({
    queryKey: ["stat-funnel"],
    queryFn: () =>
      selectRows({
        schema: "praticase",
        table: "god_mode_osce_funnel_v",
        rawQuery: "order=metric_day.desc",
        limit: 3000,
      }),
    retry: false,
  });
  const scoreQ = useQuery({
    queryKey: ["stat-score"],
    queryFn: () =>
      selectRows({
        schema: "praticase",
        table: "god_mode_score_distribution_v",
        rawQuery: "order=metric_day.desc",
        limit: 2000,
      }),
    retry: false,
  });
  const aiQ = useQuery({
    queryKey: ["stat-ai"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "ai_usage_events",
        select: "id,model,total_token_count,total_cost_usd,created_at",
        rawQuery: "order=created_at.desc",
        limit: 4000,
      }),
    retry: false,
  });

  const funnel = funnelQ.data?.data ?? [];
  const score = scoreQ.data?.data ?? [];
  const ai = aiQ.data?.data ?? [];

  const totalStarted = funnel.reduce((s, r) => s + numberValue(r.started_count), 0);
  const totalCompleted = funnel.reduce((s, r) => s + numberValue(r.completed_count), 0);
  const completionRate = totalStarted > 0 ? Math.round((totalCompleted / totalStarted) * 100) : 0;

  const daily = useMemo(() => {
    const map = new Map<string, { day: string; started: number; completed: number }>();
    for (const r of funnel) {
      const d = String(r.metric_day ?? "");
      if (!d) continue;
      const cur = map.get(d) ?? { day: d, started: 0, completed: 0 };
      cur.started += numberValue(r.started_count);
      cur.completed += numberValue(r.completed_count);
      map.set(d, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => a.day.localeCompare(b.day))
      .slice(-30)
      .map((x) => ({ ...x, day: x.day.slice(5) }));
  }, [funnel]);

  const bands = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of score) {
      const b = String(r.score_band ?? "");
      if (!b) continue;
      map.set(b, (map.get(b) ?? 0) + numberValue(r.session_count));
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([band, count]) => ({ band, count }));
  }, [score]);

  const topCases = useMemo(() => {
    const map = new Map<
      string,
      {
        title: string;
        branch: string;
        started: number;
        completed: number;
        scoreSum: number;
        scoreN: number;
      }
    >();
    for (const r of funnel) {
      const id = String(r.case_id ?? "");
      if (!id) continue;
      const cur = map.get(id) ?? {
        title: String(r.case_title ?? r.title ?? id),
        branch: String(r.branch ?? ""),
        started: 0,
        completed: 0,
        scoreSum: 0,
        scoreN: 0,
      };
      cur.started += numberValue(r.started_count);
      cur.completed += numberValue(r.completed_count);
      const s = numberValue(r.average_completed_score);
      if (s > 0) {
        cur.scoreSum += s;
        cur.scoreN += 1;
      }
      map.set(id, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.started - a.started)
      .slice(0, 15);
  }, [funnel]);

  const aiTokens = ai.reduce((s, r) => s + numberValue(r.total_token_count), 0);
  const modelCosts = useMemo(() => {
    const map = new Map<string, { cost: number; tokens: number; count: number }>();
    for (const r of ai) {
      const m = String(r.model ?? "—");
      const cur = map.get(m) ?? { cost: 0, tokens: 0, count: 0 };
      cur.cost += numberValue(r.total_cost_usd);
      cur.tokens += numberValue(r.total_token_count);
      cur.count += 1;
      map.set(m, cur);
    }
    return Array.from(map.entries())
      .map(([model, v]) => ({ model, ...v }))
      .sort((a, b) => b.cost - a.cost);
  }, [ai]);

  const loading = funnelQ.isLoading || scoreQ.isLoading || aiQ.isLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="İstatistik"
        description="OSCE funnel • skor dağılımı • AI maliyet"
        icon={BarChart3}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard label="Başlatılan" value={loading ? "…" : formatNumber(totalStarted)} />
        <KpiCard
          label="Tamamlanan"
          value={loading ? "…" : formatNumber(totalCompleted)}
          tone="success"
        />
        <KpiCard
          label="Tamamlama %"
          value={loading ? "…" : `${completionRate}%`}
          tone={completionRate >= 50 ? "success" : "warning"}
        />
        <KpiCard label="AI token" value={loading ? "…" : formatNumber(aiTokens)} />
        <KpiCard
          label="AI çağrısı"
          value={loading ? "…" : formatNumber(modelCosts.reduce((s, m) => s + m.count, 0))}
          tone="info"
        />
        <KpiCard
          label="AI maliyet $"
          value={loading ? "…" : `$${formatNumber(modelCosts.reduce((s, m) => s + m.cost, 0))}`}
          tone="warning"
        />
      </div>

      <SectionCard title="Günlük Sınav Aktivitesi" description="Son 30 gün · started vs completed">
        {loading ? (
          <ChartLoading />
        ) : daily.length === 0 ? (
          <Empty />
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="started"
                stroke="hsl(var(--info))"
                strokeWidth={2}
                dot={false}
                name="Başlatılan"
              />
              <Line
                type="monotone"
                dataKey="completed"
                stroke="hsl(var(--success))"
                strokeWidth={2}
                dot={false}
                name="Tamamlanan"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Skor Dağılımı" description="score_band bazında oturum">
          {loading ? (
            <ChartLoading />
          ) : bands.length === 0 ? (
            <Empty />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={bands} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="band" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="count"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                  name="Oturum"
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </SectionCard>

        <SectionCard title="Model Bazlı AI Maliyet">
          {loading ? (
            <ChartLoading />
          ) : modelCosts.length === 0 ? (
            <Empty />
          ) : (
            <div className="space-y-2">
              {modelCosts.map((m) => (
                <div
                  key={m.model}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{m.model}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatNumber(m.tokens)} token • {m.count} çağrı
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-bold text-warning">
                    ${formatNumber(m.cost)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard title="En Çok Çözülen Vakalar" description="Top 15 · başlatma sayısına göre">
        {loading ? (
          <ChartLoading />
        ) : topCases.length === 0 ? (
          <Empty />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Vaka</TableHead>
                <TableHead className="text-right">Başlatılan</TableHead>
                <TableHead className="text-right">Tamamlanan</TableHead>
                <TableHead className="text-right">Ort. Skor</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topCases.map((c, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="text-sm font-medium">{c.title}</div>
                    <div className="text-xs text-muted-foreground">{c.branch}</div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(c.started)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatNumber(c.completed)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {c.scoreN > 0 ? formatNumber(c.scoreSum / c.scoreN) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
    </div>
  );
}
function Empty() {
  return <div className="py-8 text-sm text-muted-foreground">Veri bulunamadı.</div>;
}
