import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { ListChecks } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/job-queue")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Job Queue & Hatalar" description="Birleşik operasyonel hata akışı" icon={ListChecks} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="SourceBase failed jobs"><EmptySchemaState /></SectionCard>
        <SectionCard title="SourceBase stale processing (>10dk)"><EmptySchemaState /></SectionCard>
        <SectionCard title="PratiCase session_ai_enrichments failures"><EmptySchemaState /></SectionCard>
        <SectionCard title="Edge function hata kayıtları"><EmptySchemaState /></SectionCard>
        <SectionCard title="Başarısız / hak verilmemiş purchases"><EmptySchemaState /></SectionCard>
        <SectionCard title="Son HTTP/status logları"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
