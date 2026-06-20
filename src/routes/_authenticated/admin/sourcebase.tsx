import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/admin/shared";
import { CountKpiCard, LiveTableCard, StatusCountStrip } from "@/components/admin/live-data";
import { Database } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const statuses = ["queued", "processing", "completed", "failed", "cancelled"];

export const Route = createFileRoute("/_authenticated/admin/sourcebase")({
  component: Sourcebase,
});

function Sourcebase() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="SourceBase"
        description="Drive, generation jobs, outputs, ürünler, storage ve maliyet"
        icon={Database}
      />
      <StatusCountStrip schema="sourcebase" table="generated_jobs" statuses={statuses} />
      <SectionMetrics />
      <Tabs defaultValue="queued">
        <TabsList>
          {statuses.map((status) => (
            <TabsTrigger key={status} value={status}>
              {status}
            </TabsTrigger>
          ))}
        </TabsList>
        {statuses.map((status) => (
          <TabsContent key={status} value={status}>
            <LiveTableCard
              title={`Generated Jobs · ${status}`}
              schema="sourcebase"
              table="generated_jobs"
              rawQuery={`status=eq.${status}`}
              order="created_at"
              limit={50}
            />
          </TabsContent>
        ))}
      </Tabs>
      <div className="grid gap-4 lg:grid-cols-2">
        <LiveTableCard
          title="Drive files"
          schema="sourcebase"
          table="drive_files"
          order="created_at"
          limit={30}
        />
        <LiveTableCard
          title="Courses / Sections"
          schema="sourcebase"
          table="courses"
          order="created_at"
          limit={30}
        />
        <LiveTableCard
          title="Generated Outputs"
          schema="sourcebase"
          table="generated_outputs"
          order="created_at"
          limit={30}
        />
        <LiveTableCard
          title="Products / Entitlements"
          schema="sourcebase"
          table="products"
          order="created_at"
          limit={30}
        />
        <LiveTableCard
          title="wallet_transactions"
          schema="sourcebase"
          table="wallet_transactions"
          order="created_at"
          limit={30}
        />
        <LiveTableCard
          title="support_tickets"
          schema="sourcebase"
          table="support_tickets"
          order="created_at"
          limit={30}
        />
      </div>
    </div>
  );
}

function SectionMetrics() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <CountKpiCard label="Courses" schema="sourcebase" table="courses" />
      <CountKpiCard label="Sources" schema="sourcebase" table="sources" />
      <CountKpiCard label="Decks" schema="sourcebase" table="decks" />
      <CountKpiCard label="Cards" schema="sourcebase" table="cards" />
    </div>
  );
}
