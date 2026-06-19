import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/icerik-sagligi")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="İçerik Sağlığı" icon={Heart} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Qlinik" description="Eksik option/açıklama, pasif soru, duplicate stem">
          <EmptySchemaState />
        </SectionCard>
        <SectionCard title="SourceBase" description="Çıktısız completed job, başarısız extraction, kaynaksız output">
          <EmptySchemaState />
        </SectionCard>
        <SectionCard title="PratiCase" description="Eksik checklist modülü, orphan checklist, boş rubric, eksik dx/mgmt">
          <EmptySchemaState />
        </SectionCard>
        <SectionCard title="Store" description="Mapping uyuşmazlığı, app_key eksik, pasif ürün hala alınabiliyor">
          <EmptySchemaState />
        </SectionCard>
        <SectionCard title="Wallet" description="Profile cache mismatch, expired entitlements + remaining > 0">
          <EmptySchemaState />
        </SectionCard>
      </div>
    </div>
  ),
});
