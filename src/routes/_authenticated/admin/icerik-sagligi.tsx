import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import { CountKpiCard, LiveTableCard } from "@/components/admin/live-data";
import { Heart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/icerik-sagligi")({
  component: IcerikSagligi,
});

function IcerikSagligi() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="İçerik Sağlığı"
        description="v2 ContentHealth ve operasyon kontrolleri"
        icon={Heart}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <CountKpiCard
          label="PratiCase sorun"
          schema="praticase"
          table="god_mode_content_health_v"
          rawQuery="health_status=neq.healthy"
          tone="destructive"
        />
        <CountKpiCard
          label="Qlinik pasif"
          schema="public"
          table="questions"
          rawQuery="is_active=eq.false"
          tone="warning"
        />
        <CountKpiCard
          label="SourceBase failed"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.failed"
          tone="destructive"
        />
        <CountKpiCard
          label="Expired entitlement"
          schema="public"
          table="wallet_entitlements"
          rawQuery="status=eq.active&expires_at=lt.now()"
          tone="warning"
        />
        <CountKpiCard
          label="Pasif ürün"
          schema="public"
          table="store_products"
          rawQuery="is_active=eq.false"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="PratiCase content health"
          schema="praticase"
          table="god_mode_content_health_v"
          rawQuery="health_status=neq.healthy&order=updated_at.desc"
          limit={100}
        />
        <LiveTableCard
          title="Qlinik pasif / eksik soru"
          schema="public"
          table="questions"
          rawQuery="is_active=eq.false&order=created_at.desc"
          limit={100}
        />
        <LiveTableCard
          title="SourceBase failed jobs"
          schema="sourcebase"
          table="generated_jobs"
          rawQuery="status=eq.failed&order=created_at.desc"
          limit={100}
        />
        <LiveTableCard
          title="Store pasif ürünler"
          schema="public"
          table="store_products"
          rawQuery="is_active=eq.false&order=sort_order.asc"
          limit={100}
        />
        <LiveTableCard
          title="Wallet expired active entitlements"
          schema="public"
          table="wallet_entitlements"
          rawQuery="status=eq.active&expires_at=lt.now()&order=expires_at.asc"
          limit={100}
        />
        <LiveTableCard
          title="PratiCase content audit events"
          schema="praticase"
          table="admin_content_audit_events"
          order="created_at"
          limit={100}
        />
      </div>
    </div>
  );
}
