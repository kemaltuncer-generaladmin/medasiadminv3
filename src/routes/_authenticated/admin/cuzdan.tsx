import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/cuzdan")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Cüzdan & Haklar" description="MC, soru hakkı, entitlement ve gift code yönetimi" icon={Wallet} />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {["Aktif MC", "Aktif soru hakkı", "7 günde dolacak", "İade/iptal", "Manuel grant", "Gift code kullanım"].map((l) => (
          <KpiCard key={l} label={l} value="—" />
        ))}
      </div>
      <div className="grid gap-4">
        <SectionCard title="wallet_entitlements"><EmptySchemaState /></SectionCard>
        <SectionCard title="gift_codes & gift_code_redemptions"><EmptySchemaState /></SectionCard>
        <SectionCard title="Sağlık kontrolleri" description="purchases ↔ entitlement, profile wallet cache, app_key eksikleri">
          <EmptySchemaState />
        </SectionCard>
      </div>
    </div>
  ),
});
