import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, EmptySchemaState, SectionCard, KpiCard } from "@/components/admin/shared";
import { Database } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin/sourcebase")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="SourceBase" description="Drive, AI generation jobs, outputs, ürünler, storage, maliyet, hata kurtarma" icon={Database} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {["Queued", "Processing", "Completed (24s)", "Failed (24s)"].map((l) => <KpiCard key={l} label={l} value="—" />)}
      </div>
      <SectionCard title="Generated Jobs">
        <Tabs defaultValue="queued">
          <TabsList>
            {["queued","processing","completed","failed","cancelled"].map(s => <TabsTrigger key={s} value={s}>{s}</TabsTrigger>)}
          </TabsList>
          {["queued","processing","completed","failed","cancelled"].map(s => (
            <TabsContent key={s} value={s}><EmptySchemaState /></TabsContent>
          ))}
        </Tabs>
      </SectionCard>
      <div className="grid lg:grid-cols-2 gap-4">
        <SectionCard title="Drive / Courses / Sections / Files"><EmptySchemaState /></SectionCard>
        <SectionCard title="Generated Outputs"><EmptySchemaState /></SectionCard>
        <SectionCard title="Products / Entitlements"><EmptySchemaState /></SectionCard>
        <SectionCard title="Storage roots & quota"><EmptySchemaState /></SectionCard>
        <SectionCard title="wallet_transactions"><EmptySchemaState /></SectionCard>
        <SectionCard title="Sağlık: stale processing > 10dk, failed by type"><EmptySchemaState /></SectionCard>
      </div>
    </div>
  ),
});
