import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import { CountKpiCard, LiveTableCard } from "@/components/admin/live-data";
import { ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/job-queue")({
  component: JobQueue,
});

function JobQueue() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Queue & Hatalar"
        description="Birleşik operasyonel hata akışı"
        icon={ListChecks}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountKpiCard
          label="SourceBase failed"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.failed"
          tone="destructive"
        />
        <CountKpiCard
          label="SourceBase processing"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.processing"
          tone="warning"
        />
        <CountKpiCard
          label="PratiCase enrich fail"
          schema="praticase"
          table="session_ai_enrichments"
          rawQuery="status=eq.failed"
          tone="destructive"
        />
        <CountKpiCard
          label="Purchase sorun"
          schema="public"
          table="purchases"
          rawQuery="status=in.(failed,rejected,cancelled)"
          tone="destructive"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="SourceBase failed jobs"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.failed"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="SourceBase stale processing"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.processing&order=updated_at.asc"
          limit={50}
        />
        <LiveTableCard
          title="PratiCase session_ai_enrichments failures"
          schema="praticase"
          table="session_ai_enrichments"
          rawQuery="status=eq.failed"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="Başarısız / hak verilmemiş purchases"
          schema="public"
          table="purchases"
          rawQuery="status=in.(failed,rejected,cancelled)"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="SourceBase audit_logs"
          schema="sourcebase"
          table="audit_logs"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="public.admin_action_logs"
          schema="public"
          table="admin_action_logs"
          order="created_at"
          limit={50}
        />
      </div>
    </div>
  );
}
