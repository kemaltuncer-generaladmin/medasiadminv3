import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import {
  AggregateKpiCard,
  CountKpiCard,
  LiveTableCard,
  formatNumber,
  moneyFromCents,
  numberValue,
} from "@/components/admin/live-data";
import { ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/satin-almalar")({
  component: SatinAlmalar,
});

function SatinAlmalar() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Satın Almalar & Katalog"
        description="store_products, purchases ve uygulama eşleşmeleri"
        icon={ShoppingBag}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountKpiCard label="Ürün" schema="public" table="store_products" />
        <CountKpiCard
          label="Aktif ürün"
          schema="public"
          table="store_products"
          rawQuery="is_active=eq.true"
          tone="success"
        />
        <CountKpiCard label="Satın alma" schema="public" table="purchases" />
        <AggregateKpiCard
          label="Katalog değeri"
          schema="public"
          table="store_products"
          select="id,price_cents"
          compute={(rows) =>
            formatNumber(rows.reduce((sum, row) => sum + numberValue(row.price_cents) / 100, 0))
          }
          hint="TRY"
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="store_products"
          schema="public"
          table="store_products"
          order="sort_order"
          ascending
          limit={50}
          columns={[
            { key: "code", label: "Kod" },
            { key: "name", label: "Ad" },
            {
              key: "price_cents",
              label: "Fiyat",
              render: (row) => moneyFromCents(row.price_cents),
            },
            { key: "is_active", label: "Aktif" },
            { key: "sort_order", label: "Sıra" },
          ]}
        />
        <LiveTableCard
          title="purchases"
          schema="public"
          table="purchases"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="store_purchase_attempts"
          schema="public"
          table="store_purchase_attempts"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="praticase.store_product_app_mappings"
          schema="praticase"
          table="store_product_app_mappings"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="sourcebase.products"
          schema="sourcebase"
          table="products"
          order="created_at"
          limit={50}
        />
        <LiveTableCard
          title="sourcebase.entitlements"
          schema="sourcebase"
          table="entitlements"
          order="created_at"
          limit={50}
        />
      </div>
    </div>
  );
}
