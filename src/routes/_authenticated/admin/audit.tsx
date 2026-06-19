import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, SectionCard, EmptySchemaState } from "@/components/admin/shared";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileSearch } from "lucide-react";
import { format } from "date-fns";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AuditPage,
});

function AuditPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin_action_logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("admin_action_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" description="public.admin_action_logs" icon={FileSearch} />
      <SectionCard title="Son 200 aksiyon">
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Yükleniyor…</div>
        ) : !data || data.length === 0 ? (
          <EmptySchemaState note="Henüz admin aksiyonu kaydedilmedi." />
        ) : (
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tarih</TableHead>
                  <TableHead>Aksiyon</TableHead>
                  <TableHead>Tablo</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Sebep</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{format(new Date(r.created_at), "yyyy-MM-dd HH:mm")}</TableCell>
                    <TableCell>{r.action}</TableCell>
                    <TableCell className="font-mono text-xs">{r.target_table ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{r.target_id ?? "—"}</TableCell>
                    <TableCell className="max-w-sm truncate">{r.reason ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
