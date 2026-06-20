import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import { CountKpiCard, LiveTableCard } from "@/components/admin/live-data";
import { Brain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/recall")({
  component: Recall,
});

function Recall() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Recall & Öğrenme Hafızası"
        description="Çapraz uygulama zayıflık sinyalleri ve öğrenme rollup'ları"
        icon={Brain}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountKpiCard
          label="Qlinik attempt fact"
          schema="public"
          table="medasi_learning_attempt_facts"
        />
        <CountKpiCard
          label="Qlinik gap rollup"
          schema="public"
          table="medasi_learning_gap_rollups"
        />
        <CountKpiCard
          label="KamuBase attempt fact"
          schema="kamubase"
          table="medasi_learning_attempt_facts"
        />
        <CountKpiCard
          label="KamuBase gap rollup"
          schema="kamubase"
          table="medasi_learning_gap_rollups"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="public.medasi_learning_gap_rollups"
          schema="public"
          table="medasi_learning_gap_rollups"
          order="updated_at"
          limit={100}
        />
        <LiveTableCard
          title="public.medasi_learning_attempt_facts"
          schema="public"
          table="medasi_learning_attempt_facts"
          order="created_at"
          limit={100}
        />
        <LiveTableCard
          title="kamubase.medasi_learning_gap_rollups"
          schema="kamubase"
          table="medasi_learning_gap_rollups"
          order="updated_at"
          limit={100}
        />
        <LiveTableCard
          title="kamubase.medasi_learning_attempt_facts"
          schema="kamubase"
          table="medasi_learning_attempt_facts"
          order="created_at"
          limit={100}
        />
      </div>
    </div>
  );
}
