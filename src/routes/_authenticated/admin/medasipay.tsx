import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Receipt,
  Loader2,
  CheckCircle2,
  XCircle,
  Gift,
  FileText,
  AlertTriangle,
} from "lucide-react";
import { PageHeader, SectionCard, StatusBadge, KpiCard } from "@/components/admin/shared";
import { medasipayFn, medasipayReceiptFn } from "@/lib/medasipay-server";
import { fmtDate, fmtRelative, fmtMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/medasipay")({
  component: MedasiPay,
});

type Order = Record<string, unknown>;

const STATUS_ORDER = [
  "payment_pending",
  "receipt_uploaded",
  "review",
  "approved",
  "entitled",
  "rejected",
];

const STATUS_LABEL: Record<string, string> = {
  payment_pending: "Transfer bekleniyor",
  receipt_uploaded: "Onay bekliyor",
  review: "Kontrol ediliyor",
  approved: "Hak tanımı bekliyor",
  entitled: "Hak tanımlandı",
  rejected: "Reddedildi",
};

function statusLabel(s: unknown) {
  return STATUS_LABEL[String(s)] ?? String(s ?? "—");
}

function MedasiPay() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Order | null>(null);

  const ordersQuery = useQuery({
    queryKey: ["medasipay", "orders"],
    queryFn: () => medasipayFn({ data: { op: "list" } }),
    retry: false,
  });

  const orders = ((ordersQuery.data as { orders?: Order[] } | undefined)?.orders ?? []) as Order[];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of orders) c[String(o.status)] = (c[String(o.status)] ?? 0) + 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    let rows = orders;
    if (statusFilter) rows = rows.filter((o) => o.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      rows = rows.filter((o) =>
        [o.customerName, o.customerEmail, o.reference, o.orderId, o.product].some((f) =>
          String(f ?? "")
            .toLowerCase()
            .includes(q),
        ),
      );
    }
    return rows;
  }, [orders, statusFilter, search]);

  const needsReview = orders.filter(
    (o) => o.status === "receipt_uploaded" || o.status === "review",
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="MedAsiPay / Dekontlar"
        description="Havale/EFT dekont onay akışı • odeme.medasi.com.tr"
        icon={Receipt}
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => ordersQuery.refetch()}
            disabled={ordersQuery.isFetching}
          >
            {ordersQuery.isFetching ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Yenile
          </Button>
        }
      />

      {ordersQuery.error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div className="font-medium">Ödeme servisine bağlanılamadı</div>
            <div className="mt-0.5 text-xs">
              {String((ordersQuery.error as Error).message).slice(0, 240)}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Sunucuda <code>MEDASIPAY_ADMIN_KEY</code> tanımlı olmalı.
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {STATUS_ORDER.map((s) => (
          <KpiCard
            key={s}
            label={statusLabel(s)}
            value={ordersQuery.isLoading ? "…" : (counts[s] ?? 0)}
            tone={
              s === "rejected"
                ? "destructive"
                : s === "entitled"
                  ? "success"
                  : s === "receipt_uploaded" || s === "review"
                    ? "warning"
                    : "default"
            }
          />
        ))}
      </div>

      <SectionCard
        title="Siparişler"
        description={`${needsReview} onay bekleyen • ${orders.length} toplam`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="Ad, e-posta, referans, sipariş no…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Select
            value={statusFilter || "__all"}
            onValueChange={(v) => setStatusFilter(v === "__all" ? "" : v)}
          >
            <SelectTrigger className="h-9 w-52">
              <SelectValue placeholder="Durum" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Tüm durumlar</SelectItem>
              {STATUS_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {statusLabel(s)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>

        {ordersQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">Kayıt bulunamadı.</div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Müşteri</TableHead>
                  <TableHead>Ürün</TableHead>
                  <TableHead className="text-right">Tutar</TableHead>
                  <TableHead>Durum</TableHead>
                  <TableHead>Tarih</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((o) => (
                  <TableRow
                    key={String(o.orderId)}
                    className="cursor-pointer"
                    onClick={() => setSelected(o)}
                  >
                    <TableCell>
                      <div className="text-sm font-medium">{String(o.customerName ?? "—")}</div>
                      <div className="text-xs text-muted-foreground">
                        {String(o.customerEmail ?? "—")}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{orderItemName(o)}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {fmtMoney(o.totalAmount, String(o.currency ?? "TRY"))}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={statusLabel(o.status)} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtRelative(o.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selected && (
            <OrderDrawer
              order={selected}
              onChanged={(o) => {
                setSelected(o);
                ordersQuery.refetch();
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function orderItemName(o: Order) {
  const items = (o.items as Array<{ name?: string }> | undefined) ?? [];
  return items[0]?.name ?? String(o.product ?? "—");
}

function OrderDrawer({ order, onChanged }: { order: Order; onChanged: (o: Order | null) => void }) {
  const id = String(order.orderId);
  const status = String(order.status);
  const [rejectReason, setRejectReason] = useState("");
  const [approveNote, setApproveNote] = useState("");

  const canApprove = ["receipt_uploaded", "review", "payment_pending"].includes(status);
  const canGrant = status === "approved";
  const bank = order.bankAccount as { holder?: string; iban?: string } | undefined;
  const items = (order.items as Array<Record<string, unknown>> | undefined) ?? [];
  const receipt = order.receipt as { originalName?: string; uploadedAt?: string } | undefined;

  const approveMut = useMutation({
    mutationFn: () => medasipayFn({ data: { op: "approve", orderId: id, note: approveNote } }),
    onSuccess: (r) => {
      toast.success("Sipariş onaylandı");
      onChanged(((r as { order?: Order }).order as Order) ?? null);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const rejectMut = useMutation({
    mutationFn: () => medasipayFn({ data: { op: "reject", orderId: id, reason: rejectReason } }),
    onSuccess: (r) => {
      toast.success("Sipariş reddedildi");
      onChanged(((r as { order?: Order }).order as Order) ?? null);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const grantMut = useMutation({
    mutationFn: () => medasipayFn({ data: { op: "grant", orderId: id } }),
    onSuccess: (r) => {
      toast.success("Hak tanımlandı");
      onChanged(((r as { order?: Order }).order as Order) ?? null);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const receiptMut = useMutation({
    mutationFn: () =>
      medasipayReceiptFn({ data: { orderId: id, filename: receipt?.originalName } }),
    onSuccess: (r) => {
      const w = window.open();
      if (w) w.location.href = r.dataUrl;
      else toast.error("Dekont açılamadı (popup engellenmiş olabilir).");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const busy = approveMut.isPending || rejectMut.isPending || grantMut.isPending;

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle>{orderItemName(order)}</SheetTitle>
        <SheetDescription>
          {statusLabel(status)} • {fmtDate(order.createdAt)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5">
        <div className="flex items-center justify-between rounded-lg border bg-card p-4">
          <div>
            <div className="font-mono text-2xl font-bold">
              {fmtMoney(order.totalAmount, String(order.currency ?? "TRY"))}
            </div>
            <div className="mt-1">
              <StatusBadge status={statusLabel(status)} />
            </div>
          </div>
          {receipt ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => receiptMut.mutate()}
              disabled={receiptMut.isPending}
            >
              {receiptMut.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-1.5 h-4 w-4" />
              )}{" "}
              Dekont
            </Button>
          ) : null}
        </div>

        <SectionCard title="İşlemler">
          <div className="space-y-3">
            {canApprove ? (
              <div className="space-y-2">
                <Label className="text-xs">Onay notu (opsiyonel)</Label>
                <Input
                  value={approveNote}
                  onChange={(e) => setApproveNote(e.target.value)}
                  placeholder="Admin panelinden onaylandı."
                  className="h-9"
                />
                <Button className="w-full" disabled={busy} onClick={() => approveMut.mutate()}>
                  {approveMut.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-4 w-4" />
                  )}{" "}
                  Onayla
                </Button>
              </div>
            ) : null}

            {canGrant ? (
              <Button
                variant="secondary"
                className="w-full"
                disabled={busy}
                onClick={() => grantMut.mutate()}
              >
                {grantMut.isPending ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Gift className="mr-1.5 h-4 w-4" />
                )}{" "}
                Hak Tanımla
              </Button>
            ) : null}

            {status !== "entitled" && status !== "rejected" ? (
              <div className="space-y-2 border-t pt-3">
                <Label className="text-xs">Red sebebi (opsiyonel)</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Admin panelinden reddedildi."
                  rows={2}
                />
                <Button
                  variant="outline"
                  className="w-full text-destructive hover:text-destructive"
                  disabled={busy}
                  onClick={() => rejectMut.mutate()}
                >
                  {rejectMut.isPending ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <XCircle className="mr-1.5 h-4 w-4" />
                  )}{" "}
                  Reddet
                </Button>
              </div>
            ) : null}
          </div>
        </SectionCard>

        <SectionCard title="Müşteri & Sipariş">
          <dl className="divide-y text-sm">
            <KV k="Müşteri" v={String(order.customerName ?? "—")} />
            <KV k="E-posta" v={String(order.customerEmail ?? "—")} />
            <KV k="Sipariş No" v={id} mono />
            <KV k="Referans" v={String(order.reference ?? "—")} mono />
            <KV k="Kanal" v={String(order.channel ?? "—")} />
            {bank?.iban ? <KV k="IBAN" v={String(bank.iban)} mono /> : null}
            {bank?.holder ? <KV k="Hesap sahibi" v={String(bank.holder)} /> : null}
            {receipt?.uploadedAt ? (
              <KV k="Dekont yüklendi" v={fmtDate(receipt.uploadedAt)} />
            ) : null}
            {order.rejectionReason ? <KV k="Red sebebi" v={String(order.rejectionReason)} /> : null}
            {order.lastWebhookError ? (
              <KV k="Webhook hatası" v={String(order.lastWebhookError)} />
            ) : null}
          </dl>
        </SectionCard>

        {items.length > 0 ? (
          <SectionCard title="Kalemler">
            <div className="divide-y">
              {items.map((it, i) => (
                <div
                  key={String(it.sku ?? i)}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {String(it.name ?? it.sku ?? "—")}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.entitlementType ? `${it.entitlementType} • ` : ""}
                      {String(it.quantity ?? 1)} adet
                    </div>
                  </div>
                  <span className="shrink-0 font-mono text-xs">
                    {fmtMoney(it.unitPrice, String(it.currency ?? order.currency ?? "TRY"))}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-2">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "truncate text-right"}>{v}</dd>
    </div>
  );
}
