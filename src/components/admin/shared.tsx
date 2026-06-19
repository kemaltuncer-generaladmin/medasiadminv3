import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Database, RefreshCcw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function PageHeader({
  title, description, icon: Icon, actions,
}: { title: string; description?: string; icon?: LucideIcon; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mt-0.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
          <RefreshCcw className="h-4 w-4 mr-1.5" /> Yenile
        </Button>
      </div>
    </div>
  );
}

export function EmptySchemaState({ note }: { note?: string }) {
  return (
    <Card className="border-dashed">
      <CardContent className="py-12 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <Database className="h-6 w-6 text-muted-foreground" />
        </div>
        <div>
          <div className="font-medium">Bu yüzey canlı şemada yok veya yetkin yok</div>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {note ?? "İlgili tablo/view bağlı veritabanında bulunamadı. Self-hosted Postgres bağlantısı kurulduktan sonra otomatik olarak veri görüntülenecektir."}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function KpiCard({
  label, value, hint, tone = "default",
}: { label: string; value: string | number; hint?: string; tone?: "default" | "success" | "warning" | "destructive" | "info" }) {
  const toneMap: Record<string, string> = {
    default: "",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    info: "text-info",
  };
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="text-xs uppercase tracking-wide">{label}</CardDescription>
        <CardTitle className={cn("text-2xl tabular-nums", toneMap[tone])}>{value}</CardTitle>
      </CardHeader>
      {hint && <CardContent className="pt-0 text-xs text-muted-foreground">{hint}</CardContent>}
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const green = ["active", "completed", "published", "approved", "entitled", "paid"];
  const amber = ["pending", "processing", "review", "queued", "receipt_uploaded", "payment_pending"];
  const red = ["failed", "refunded", "cancelled", "revoked", "rejected", "error"];
  const gray = ["draft", "inactive", "archived"];
  const cls = green.some((x) => s.includes(x))
    ? "bg-success/15 text-success border-success/30"
    : amber.some((x) => s.includes(x))
    ? "bg-warning/15 text-warning border-warning/30"
    : red.some((x) => s.includes(x))
    ? "bg-destructive/15 text-destructive border-destructive/30"
    : gray.some((x) => s.includes(x))
    ? "bg-muted text-muted-foreground border-border"
    : "bg-accent text-accent-foreground border-border";
  return <Badge variant="outline" className={cn("font-normal", cls)}>{status}</Badge>;
}

export function SectionCard({
  title, description, children, actions,
}: { title: string; description?: string; children: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
