import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import { CountKpiCard, LiveTableCard } from "@/components/admin/live-data";
import { Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/praticase")({
  component: Praticase,
});

function Praticase() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="PratiCase"
        description="Vakalar, checklist factory, funnel ve içerik sağlığı"
        icon={Stethoscope}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountKpiCard label="Toplam vaka" schema="praticase" table="cases" />
        <CountKpiCard
          label="Yayında"
          schema="praticase"
          table="cases"
          rawQuery="is_active=eq.true"
          tone="success"
        />
        <CountKpiCard label="Content health" schema="praticase" table="god_mode_content_health_v" />
        <CountKpiCard label="Exam sessions" schema="praticase" table="exam_sessions" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="Cases"
          schema="praticase"
          table="cases"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="god_mode_case_publication_v"
          schema="praticase"
          table="god_mode_case_publication_v"
          rawQuery="order=updated_at.desc"
          limit={50}
        />
        <LiveTableCard
          title="god_mode_content_health_v"
          schema="praticase"
          table="god_mode_content_health_v"
          rawQuery="order=updated_at.desc"
          limit={50}
        />
        <LiveTableCard
          title="god_mode_osce_funnel_v"
          schema="praticase"
          table="god_mode_osce_funnel_v"
          rawQuery="order=metric_day.desc"
          limit={50}
        />
        <LiveTableCard
          title="god_mode_score_distribution_v"
          schema="praticase"
          table="god_mode_score_distribution_v"
          rawQuery="order=metric_day.desc"
          limit={50}
        />
        <LiveTableCard
          title="Aktif banner & duyurular"
          schema="praticase"
          table="home_banners"
          rawQuery="is_active=eq.true&order=sort_order.asc"
          limit={50}
        />
      </div>
      <LiveTableCard
        title="Transkript verisi"
        description="Ham transkript içeren session kayıtları; sadece yetkili admin rolünde görünür."
        schema="praticase"
        table="exam_messages"
        order="created_at"
        limit={25}
      />
    </div>
  );
}
