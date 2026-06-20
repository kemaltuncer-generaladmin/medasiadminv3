import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Boxes, Loader2, Plus, MoreVertical } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  selectRows,
  auditedInsert,
  auditedUpdate,
  auditedDelete,
  type JsonRow,
} from "@/lib/supabase-rest";
import { fmtMoney } from "@/lib/format";
import { numberValue } from "@/components/admin/live-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/kaynaklar")({
  component: Kaynaklar,
});

const SCHEMA = "sourcebase" as const;
const STATUSES = ["draft", "published", "archived"];

function Kaynaklar() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<JsonRow | null>(null);
  const [creating, setCreating] = useState(false);

  const productsQ = useQuery({
    queryKey: ["sb-products"],
    queryFn: () =>
      selectRows({
        schema: SCHEMA,
        table: "products",
        rawQuery: "order=created_at.desc",
        limit: 500,
      }),
    retry: false,
  });
  const products = productsQ.data?.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) =>
      [p.title, p.slug].some((f) =>
        String(f ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [products, search]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["sb-products"] });

  const statusMut = useMutation({
    mutationFn: ({ p, status }: { p: JsonRow; status: string }) =>
      auditedUpdate({
        schema: SCHEMA,
        table: "products",
        id: String(p.id),
        fields: { status },
        action: status === "published" ? "publish_product" : "update_product",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (p: JsonRow) =>
      auditedDelete({
        schema: SCHEMA,
        table: "products",
        id: String(p.id),
        action: "delete_product",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kaynaklar"
        description={`SourceBase pazar yeri • ${products.length} ürün`}
        icon={Boxes}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Yeni Ürün
          </Button>
        }
      />

      <SectionCard title="Ürünler" description="sourcebase.products">
        <div className="mb-3 flex items-center gap-2">
          <Input
            placeholder="Başlık / slug…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 max-w-xs"
          />
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>

        {productsQ.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : productsQ.error ? (
          <div className="py-6 text-sm text-destructive">
            {String((productsQ.error as Error).message).slice(0, 200)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-6 text-sm text-muted-foreground">Ürün bulunamadı.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ürün</TableHead>
                <TableHead className="text-right">Fiyat</TableHead>
                <TableHead>Durum</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow
                  key={String(p.id)}
                  className="cursor-pointer"
                  onClick={() => setEditing(p)}
                >
                  <TableCell>
                    <div className="text-sm font-medium">{String(p.title ?? "—")}</div>
                    <div className="font-mono text-xs text-muted-foreground">
                      {String(p.slug ?? "")}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-bold text-warning">
                    {fmtMoney(numberValue(p.price_cents) / 100, String(p.currency ?? "TRY"))}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={String(p.status ?? "draft")} />
                  </TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(p)}>Düzenle</DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() =>
                            statusMut.mutate({
                              p,
                              status: p.status === "published" ? "draft" : "published",
                            })
                          }
                        >
                          {p.status === "published" ? "Yayından kaldır" : "Yayınla"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => deleteMut.mutate(p)}
                        >
                          Sil
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </SectionCard>

      <ProductEditor
        open={creating}
        onOpenChange={setCreating}
        product={null}
        onSaved={invalidate}
      />
      <ProductEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        product={editing}
        onSaved={invalidate}
      />
    </div>
  );
}

function ProductEditor({
  product,
  open,
  onOpenChange,
  onSaved,
}: {
  product: JsonRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = !product;
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [desc, setDesc] = useState("");
  const [price, setPrice] = useState("");
  const [status, setStatus] = useState("draft");

  useEffect(() => {
    if (open) {
      setTitle(String(product?.title ?? ""));
      setSlug(String(product?.slug ?? ""));
      setDesc(String(product?.description ?? ""));
      setPrice(product ? (numberValue(product.price_cents) / 100).toFixed(2) : "");
      setStatus(String(product?.status ?? "draft"));
    }
  }, [open, product]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const cents = Math.round((Number(price.replace(",", ".")) || 0) * 100);
      const fields = {
        title,
        slug,
        description: desc || null,
        price_cents: cents,
        currency: "TRY",
        status,
      };
      if (product) {
        return auditedUpdate({
          schema: SCHEMA,
          table: "products",
          id: String(product.id),
          fields,
          action: "update_product",
        });
      }
      return auditedInsert({
        schema: SCHEMA,
        table: "products",
        values: fields,
        action: "create_product",
      });
    },
    onSuccess: () => {
      toast.success(isNew ? "Ürün oluşturuldu" : "Kaydedildi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Yeni Ürün" : "Ürünü Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Başlık">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Slug (ör. medical-terms)">
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} className="font-mono" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Fiyat (₺)">
              <Input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </Field>
            <Field label="Durum">
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Açıklama">
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            disabled={!title.trim() || !slug.trim() || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{" "}
            {isNew ? "Oluştur" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
