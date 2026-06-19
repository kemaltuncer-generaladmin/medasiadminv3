import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { HelpCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/qlinik")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Qlinik" description="Soru bankası, attempts, store, AI mentor, import sağlığı" icon={HelpCircle} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["Canlı soru", "Pasif soru", "Eksik içerik", "Quota tükenen kullanıcı"].map((l) => <KpiCard key={l} label={l} value="—" />)}
      </div>
      <SectionCard title="Soru Bankası" description="subject, topic, zorluk, tür, kognitif seviye, kaynak"><EmptySchemaState /></SectionCard>
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="question_attempts"><EmptySchemaState /></SectionCard>
        <SectionCard title="spot_facts & feedbacks"><EmptySchemaState /></SectionCard>
        <SectionCard title="AI mentor kullanımı"><EmptySchemaState /></SectionCard>
        <SectionCard title="ai_plans"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
