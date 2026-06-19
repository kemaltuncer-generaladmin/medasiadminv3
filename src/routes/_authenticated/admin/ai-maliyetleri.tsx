import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/ai-maliyetleri")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="AI Maliyetleri" description="ai_usage_events + SourceBase cost_estimate" icon={Coins} />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {["Toplam (USD)", "Input tokens", "Output tokens", "Maliyet/uygulama", "Outlier"].map((l) => (
          <KpiCard key={l} label={l} value="—" />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Günlük maliyet"><EmptySchemaState /></SectionCard>
        <SectionCard title="Modele göre maliyet"><EmptySchemaState /></SectionCard>
        <SectionCard title="Uygulamaya göre maliyet"><EmptySchemaState /></SectionCard>
        <SectionCard title="Top 20 pahalı kullanıcı/job"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
