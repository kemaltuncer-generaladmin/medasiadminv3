import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { Users } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/kullanicilar")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Kullanıcılar" description="public.profiles tablosu üzerinden yönetim" icon={Users} />
      <SectionCard title="Kullanıcı listesi" description="Filtre: e-posta, is_admin, wallet_balance, tarih aralığı">
        <EmptySchemaState note="public.profiles canlı şemada bulunamadı. Bağlantı kurulunca burada arama, filtreleme, detay drawer ve güvenli RPC aksiyonları (sync_wallet_profile, admin_grant_manual_entitlement, vb.) açılacak." />
      </SectionCard>
    </div>
  ),
});
