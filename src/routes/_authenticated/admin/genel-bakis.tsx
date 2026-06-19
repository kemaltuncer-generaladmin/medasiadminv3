import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, KpiCard, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { LayoutDashboard } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/genel-bakis")({
  component: GenelBakis,
});

function GenelBakis() {
  const kpis = [
    { label: "Toplam kullanıcı", value: "—" },
    { label: "Yeni kullanıcı (30g)", value: "—" },
    { label: "Aktif admin", value: "—" },
    { label: "Dolaşımdaki MC", value: "—" },
    { label: "Toplam soru hakkı", value: "—" },
    { label: "Aktif entitlement", value: "—" },
    { label: "Gelir (30g)", value: "—" },
    { label: "Qlinik soru sayısı", value: "—" },
    { label: "SourceBase job", value: "—" },
    { label: "PratiCase vaka", value: "—" },
    { label: "AI maliyeti (USD)", value: "—" },
    { label: "Hatalı job", value: "—", tone: "destructive" as const },
  ];
  return (
    <div className="space-y-6">
      <PageHeader title="Genel Bakış" description="Son 30 gün · tüm uygulamalar" icon={LayoutDashboard} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpis.map((k) => <KpiCard key={k.label} {...k} />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Günlük yeni kullanıcılar"><EmptySchemaState /></SectionCard>
        <SectionCard title="Günlük satın alma"><EmptySchemaState /></SectionCard>
        <SectionCard title="Günlük AI maliyeti"><EmptySchemaState /></SectionCard>
        <SectionCard title="SourceBase job status dağılımı"><EmptySchemaState /></SectionCard>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Son kayıt olan kullanıcılar"><EmptySchemaState /></SectionCard>
        <SectionCard title="Son wallet entitlements"><EmptySchemaState /></SectionCard>
        <SectionCard title="Son purchases"><EmptySchemaState /></SectionCard>
        <SectionCard title="Son failed jobs"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  );
}
