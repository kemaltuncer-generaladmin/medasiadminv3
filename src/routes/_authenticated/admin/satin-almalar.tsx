import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard } from "@/components/admin/shared";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/satin-almalar")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Satın Almalar & Katalog" description="store_products, purchases, app store eşleşmeleri" icon={ShoppingBag} />
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="store_products"><EmptySchemaState /></SectionCard>
        <SectionCard title="purchases"><EmptySchemaState /></SectionCard>
        <SectionCard title="store_purchase_attempts"><EmptySchemaState /></SectionCard>
        <SectionCard title="app store subscription links"><EmptySchemaState /></SectionCard>
        <SectionCard title="praticase.store_product_app_mappings"><EmptySchemaState /></SectionCard>
        <SectionCard title="sourcebase.products / purchases / entitlements"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
