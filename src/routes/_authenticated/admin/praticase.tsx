import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { Stethoscope } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/praticase")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="PratiCase" description="Vakalar, checklist factory, OSCE / oral / theoretical exam, store, içerik sağlığı" icon={Stethoscope} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["Toplam vaka", "Yayında", "Eksik modül", "Ortalama puan"].map((l) => <KpiCard key={l} label={l} value="—" />)}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Cases (god_mode_case_publication_v)"><EmptySchemaState /></SectionCard>
        <SectionCard title="Content health (5 checklist modülü)"><EmptySchemaState /></SectionCard>
        <SectionCard title="OSCE funnel (god_mode_osce_funnel_v)"><EmptySchemaState /></SectionCard>
        <SectionCard title="Oral exam funnel"><EmptySchemaState /></SectionCard>
        <SectionCard title="Theoretical exam"><EmptySchemaState /></SectionCard>
        <SectionCard title="Score distribution"><EmptySchemaState /></SectionCard>
        <SectionCard title="Dropoff (history/PE/test/dx/mgmt)"><EmptySchemaState /></SectionCard>
        <SectionCard title="Aktif banner & duyurular"><EmptySchemaState /></SectionCard>
      </div>
      <SectionCard
        title="Transkript verisi"
        description="Ham transkript varsayılan olarak gizlidir; uyarı drawer'ı ile açılır.">
        <EmptySchemaState note="Ham hasta transkriptleri varsayılan olarak gösterilmez." />
      </SectionCard>
    </div>
  ),
});
