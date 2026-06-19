import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { Brain } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/recall")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Recall & Öğrenme Hafızası" description="Çapraz uygulama zayıflık sinyalleri, sanitize özetler" icon={Brain} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["Aktif zayıflık", "Bugün vadesi", "Yüksek öncelik", "Başarısız entegrasyon"].map((l) => (
          <KpiCard key={l} label={l} value="—" />
        ))}
      </div>
      <SectionCard title="Cross-app weakness tablosu" description="source_app: qlinik / sourcebase / praticase">
        <EmptySchemaState note="Recall'ın ana akışları bloklamamasına dikkat edin. Sadece sanitize özet gösterilir." />
      </SectionCard>
    </div>
  ),
});
