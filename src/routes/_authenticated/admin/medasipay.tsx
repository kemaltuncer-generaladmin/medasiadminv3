import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, StatusBadge } from "@/components/admin/shared";
import { Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/medasipay")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="MedAsiPay / Dekontlar" description="Harici ödeme onay akışı" icon={Receipt} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {["payment_pending", "receipt_uploaded", "review", "approved", "entitled", "rejected"].map((s) => (
          <div key={s} className="rounded-lg border bg-card p-3 flex flex-col gap-2">
            <StatusBadge status={s} />
            <div className="text-2xl font-semibold tabular-nums">—</div>
          </div>
        ))}
      </div>
      <SectionCard title="Sipariş listesi" description="order_id, referans, müşteri, ürün, tutar, ödeme yöntemi, durum, tarih">
        <EmptySchemaState note="MedAsiPay REST/datasource entegrasyonu sonrası burada onay, reddet, hak tanımını tekrar dene aksiyonları (admin notu zorunlu) görünecek." />
      </SectionCard>
    </div>
  ),
});
