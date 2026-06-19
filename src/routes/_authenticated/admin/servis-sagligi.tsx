import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, SectionCard } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Activity } from "lucide-react";
import { toast } from "sonner";

const checks = [
  "Supabase DB ping",
  "count profiles",
  "count questions",
  "count sourcebase.generated_jobs",
  "count praticase.cases",
  "stale SourceBase jobs",
  "ungranted purchases",
  "recent AI failures",
];

export const Route = createFileRoute("/_authenticated/admin/servis-sagligi")({
  component: () => (
    <div className="space-y-6">
      <PageHeader title="Deploy / Servis Sağlığı" icon={Activity} />
      <SectionCard title="Manuel kontroller">
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-2">
          {checks.map((c) => (
            <div key={c} className="flex items-center justify-between rounded-md border p-3">
              <span className="text-sm">{c}</span>
              <Button size="sm" variant="outline" onClick={() => toast.info(`${c}: canlı bağlantı bekleniyor`)}>
                Çalıştır
              </Button>
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="HTTP endpoint sağlığı" description="qlinik, sourcebase, praticase, ödeme, indirme, landing">
        <div className="text-sm text-muted-foreground">HTTP datasource ekleyince burada yeşil/sarı/kırmızı kartlar listelenecek.</div>
      </SectionCard>
    </div>
  ),
});
