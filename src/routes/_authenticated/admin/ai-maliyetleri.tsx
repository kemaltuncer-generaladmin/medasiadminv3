import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import {
  AggregateKpiCard,
  CountKpiCard,
  LiveTableCard,
  formatNumber,
  numberValue,
} from "@/components/admin/live-data";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai-maliyetleri")({
  component: AiMaliyetleri,
});

function AiMaliyetleri() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="AI Maliyetleri"
        description="ai_usage_events + SourceBase cost_estimate"
        icon={Coins}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <AggregateKpiCard
          label="Toplam USD"
          schema="public"
          table="ai_usage_events"
          select="id,total_cost_usd"
          compute={(rows) =>
            `$${formatNumber(rows.reduce((sum, row) => sum + numberValue(row.total_cost_usd), 0))}`
          }
          tone="warning"
        />
        <AggregateKpiCard
          label="Input tokens"
          schema="public"
          table="ai_usage_events"
          select="id,input_token_count"
          compute={(rows) =>
            formatNumber(rows.reduce((sum, row) => sum + numberValue(row.input_token_count), 0))
          }
        />
        <AggregateKpiCard
          label="Output tokens"
          schema="public"
          table="ai_usage_events"
          select="id,output_token_count"
          compute={(rows) =>
            formatNumber(rows.reduce((sum, row) => sum + numberValue(row.output_token_count), 0))
          }
        />
        <AggregateKpiCard
          label="Toplam tokens"
          schema="public"
          table="ai_usage_events"
          select="id,total_token_count"
          compute={(rows) =>
            formatNumber(rows.reduce((sum, row) => sum + numberValue(row.total_token_count), 0))
          }
        />
        <CountKpiCard label="Event" schema="public" table="ai_usage_events" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="Son AI kullanımları"
          schema="public"
          table="ai_usage_events"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="SourceBase generated_jobs cost"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="cost_estimate=not.is.null&order=created_at.desc"
          limit={50}
        />
        <LiveTableCard
          title="Generated outputs"
          schema="sourcebase"
          table="generated_outputs"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="PratiCase AI enrichments"
          schema="praticase"
          table="session_ai_enrichments"
          order="created_at"
          limit={50}
        />
      </div>
    </div>
  );
}
