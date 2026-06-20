import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, ExternalLink, RefreshCcw } from "lucide-react";
import { appHealthTargets, serviceChecks, type AdminSchema } from "@/lib/admin-config";
import { countRows, pingHttpTarget } from "@/lib/supabase-rest";

export const Route = createFileRoute("/_authenticated/admin/servis-sagligi")({
  component: ServisSagligi,
});

function ServisSagligi() {
  const dbChecks = useQuery({
    queryKey: ["service-db-checks"],
    queryFn: async () => {
      return Promise.all(
        serviceChecks.map(async (check) => {
          const startedAt = performance.now();
          try {
            const count = await countRows(check.schema as AdminSchema, check.table);
            return {
              ...check,
              ok: true,
              count: count as number | undefined,
              ms: Math.round(performance.now() - startedAt),
              error: undefined as string | undefined,
            };
          } catch (error) {
            return {
              ...check,
              ok: false,
              count: undefined as number | undefined,
              ms: Math.round(performance.now() - startedAt),
              error: (error instanceof Error ? error.message : "Bilinmeyen hata") as
                | string
                | undefined,
            };
          }
        }),
      );
    },
    retry: false,
  });

  const endpointChecks = useQuery({
    queryKey: ["service-http-targets"],
    queryFn: async () =>
      Promise.all(
        appHealthTargets.map(async (target) => ({
          ...target,
          ...(await pingHttpTarget(target.url)),
        })),
      ),
    retry: false,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deploy / Servis Sağlığı"
        description="v2 panelden taşınan Supabase ve HTTP hedefleri"
        icon={Activity}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              dbChecks.refetch();
              endpointChecks.refetch();
            }}
          >
            <RefreshCcw className="mr-1.5 h-4 w-4" /> Kontrolleri Çalıştır
          </Button>
        }
      />

      <SectionCard
        title="PostgREST kontrolleri"
        description="public, kamubase, sourcebase ve praticase şemaları"
      >
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {(dbChecks.data ?? []).map((check) => (
            <div key={check.id} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{check.label}</span>
                <StatusBadge status={check.ok ? "ok" : "error"} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline">{check.schema}</Badge>
                <span>{check.ms} ms</span>
                {check.count !== undefined && <span>{check.count} kayıt</span>}
              </div>
              {check.error && (
                <div className="mt-2 line-clamp-2 text-xs text-destructive">{check.error}</div>
              )}
            </div>
          ))}
          {dbChecks.isLoading && (
            <div className="text-sm text-muted-foreground">Veritabanı kontrolleri çalışıyor...</div>
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="HTTP endpoint sağlığı"
        description="Qlinik, SourceBase, PratiCase, ödeme, indirme ve destek"
      >
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {(endpointChecks.data ?? []).map((target) => (
            <div key={target.url} className="rounded-md border p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{target.name}</div>
                  <div className="text-xs text-muted-foreground">{target.group}</div>
                </div>
                <StatusBadge status={target.ok ? "ok" : "error"} />
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{target.status ?? "no-status"}</span>
                <span>{target.ms} ms</span>
              </div>
              <a
                className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                href={target.url}
                target="_blank"
                rel="noreferrer"
              >
                {target.url} <ExternalLink className="h-3 w-3" />
              </a>
              {target.error && (
                <div className="mt-2 line-clamp-2 text-xs text-destructive">{target.error}</div>
              )}
            </div>
          ))}
          {endpointChecks.isLoading && (
            <div className="text-sm text-muted-foreground">Endpoint kontrolleri çalışıyor...</div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
