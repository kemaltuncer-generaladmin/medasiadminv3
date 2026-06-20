import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Loader2, Plus, MoreVertical, Gift } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  selectRows,
  auditedInsert,
  auditedUpdate,
  auditedDelete,
  type JsonRow,
} from "@/lib/supabase-rest";
import { numberValue } from "@/components/admin/live-data";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/marketing")({
  component: Marketing,
});

function Marketing() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Banner & Bonus"
        description="Ana sayfa banner'ları ve cüzdan bonus politikaları"
        icon={Megaphone}
      />
      <Tabs defaultValue="banners">
        <TabsList>
          <TabsTrigger value="banners">Ana Sayfa Banner'ları</TabsTrigger>
          <TabsTrigger value="bonus">Bonus Politikaları</TabsTrigger>
        </TabsList>
        <TabsContent value="banners" className="mt-4">
          <Banners />
        </TabsContent>
        <TabsContent value="bonus" className="mt-4">
          <BonusPolicies />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Banners() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<JsonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const bannersQ = useQuery({
    queryKey: ["home-banners"],
    queryFn: () =>
      selectRows({
        schema: "praticase",
        table: "home_banners",
        rawQuery: "order=sort_order.asc",
        limit: 200,
      }),
    retry: false,
  });
  const banners = bannersQ.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["home-banners"] });

  const toggleMut = useMutation({
    mutationFn: (b: JsonRow) =>
      auditedUpdate({
        schema: "praticase",
        table: "home_banners",
        id: String(b.id),
        fields: { is_active: !(b.is_active ?? true) },
        action: "toggle_banner",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (b: JsonRow) =>
      auditedDelete({
        schema: "praticase",
        table: "home_banners",
        id: String(b.id),
        action: "delete_banner",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="Ana Sayfa Banner'ları"
      description="praticase.home_banners"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Banner
        </Button>
      }
    >
      {bannersQ.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : banners.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">Banner yok.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Banner</TableHead>
              <TableHead>CTA</TableHead>
              <TableHead>Sıra</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {banners.map((b) => (
              <TableRow key={String(b.id)} className="cursor-pointer" onClick={() => setEditing(b)}>
                <TableCell>
                  <div className="text-sm font-medium">{String(b.title ?? "—")}</div>
                  <div className="text-xs text-muted-foreground">{String(b.subtitle ?? "")}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {String(b.cta_label ?? "—")} {b.deep_link ? `→ ${b.deep_link}` : ""}
                </TableCell>
                <TableCell className="text-xs">{numberValue(b.sort_order)}</TableCell>
                <TableCell>
                  <StatusBadge status={(b.is_active ?? true) ? "active" : "inactive"} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setEditing(b)}>Düzenle</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => toggleMut.mutate(b)}>
                        {(b.is_active ?? true) ? "Pasifleştir" : "Aktifleştir"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMut.mutate(b)}
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
      <BannerEditor open={creating} onOpenChange={setCreating} banner={null} onSaved={invalidate} />
      <BannerEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        banner={editing}
        onSaved={invalidate}
      />
    </SectionCard>
  );
}

function BannerEditor({
  banner,
  open,
  onOpenChange,
  onSaved,
}: {
  banner: JsonRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = !banner;
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [ctaLabel, setCtaLabel] = useState("");
  const [deepLink, setDeepLink] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setTitle(String(banner?.title ?? ""));
    setSubtitle(String(banner?.subtitle ?? ""));
    setCtaLabel(String(banner?.cta_label ?? ""));
    setDeepLink(String(banner?.deep_link ?? ""));
    setImageUrl(String(banner?.image_url ?? ""));
    setSortOrder(String(numberValue(banner?.sort_order)));
    setIsActive(Boolean(banner?.is_active ?? true));
  }, [open, banner]);

  const saveMut = useMutation({
    mutationFn: async () => {
      const fields: JsonRow = {
        title,
        subtitle: subtitle || null,
        cta_label: ctaLabel || null,
        deep_link: deepLink || null,
        image_url: imageUrl || null,
        sort_order: Number(sortOrder) || 0,
        is_active: isActive,
      };
      if (deepLink) fields.cta_route = deepLink;
      if (banner)
        return auditedUpdate({
          schema: "praticase",
          table: "home_banners",
          id: String(banner.id),
          fields,
          action: "edit_banner",
        });
      return auditedInsert({
        schema: "praticase",
        table: "home_banners",
        values: fields,
        action: "create_banner",
      });
    },
    onSuccess: () => {
      toast.success(isNew ? "Banner oluşturuldu" : "Kaydedildi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Yeni Banner" : "Banner'ı Düzenle"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Başlık">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Alt başlık">
            <Input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="CTA etiketi">
              <Input
                value={ctaLabel}
                onChange={(e) => setCtaLabel(e.target.value)}
                placeholder="Hemen Başla"
              />
            </Field>
            <Field label="Deep link / rota">
              <Input
                value={deepLink}
                onChange={(e) => setDeepLink(e.target.value)}
                placeholder="/cases"
              />
            </Field>
          </div>
          <Field label="Görsel URL">
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 items-end gap-3">
            <Field label="Sıra">
              <Input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <div className="flex items-center justify-between rounded-md border px-3 py-2">
              <Label className="text-sm">Aktif</Label>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={!title.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{" "}
            {isNew ? "Oluştur" : "Kaydet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BonusPolicies() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<JsonRow | null>(null);
  const [creating, setCreating] = useState(false);
  const policiesQ = useQuery({
    queryKey: ["bonus-policies"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "wallet_bonus_policies",
        rawQuery: "order=created_at.desc",
        limit: 200,
      }),
    retry: false,
  });
  const policies = policiesQ.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["bonus-policies"] });

  const toggleMut = useMutation({
    mutationFn: (p: JsonRow) =>
      auditedUpdate({
        schema: "public",
        table: "wallet_bonus_policies",
        id: String(p.key),
        idColumn: "key",
        fields: { is_active: !(p.is_active ?? false) },
        action: "toggle_bonus",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="Bonus Politikaları"
      description="public.wallet_bonus_policies"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Politika
        </Button>
      }
    >
      {policiesQ.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : policies.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">Politika yok.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Anahtar</TableHead>
              <TableHead>Haklar</TableHead>
              <TableHead>Süre</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.map((p) => (
              <TableRow
                key={String(p.key)}
                className="cursor-pointer"
                onClick={() => setEditing(p)}
              >
                <TableCell className="font-mono text-sm font-medium">
                  {String(p.key ?? "—")}
                </TableCell>
                <TableCell className="text-xs">
                  {numberValue(p.coin_amount)} MC · {numberValue(p.question_amount)} soru
                </TableCell>
                <TableCell className="text-xs">{numberValue(p.duration_days)} gün</TableCell>
                <TableCell>
                  <StatusBadge status={(p.is_active ?? false) ? "active" : "inactive"} />
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
                      <DropdownMenuItem onClick={() => toggleMut.mutate(p)}>
                        {(p.is_active ?? false) ? "Pasifleştir" : "Aktifleştir"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <PolicyEditor open={creating} onOpenChange={setCreating} policy={null} onSaved={invalidate} />
      <PolicyEditor
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        policy={editing}
        onSaved={invalidate}
      />
    </SectionCard>
  );
}

function PolicyEditor({
  policy,
  open,
  onOpenChange,
  onSaved,
}: {
  policy: JsonRow | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const isNew = !policy;
  const [key, setKey] = useState("");
  const [coins, setCoins] = useState("0");
  const [questions, setQuestions] = useState("0");
  const [durationDays, setDurationDays] = useState("0");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!open) return;
    setKey(String(policy?.key ?? ""));
    setCoins(String(numberValue(policy?.coin_amount)));
    setQuestions(String(numberValue(policy?.question_amount)));
    setDurationDays(String(numberValue(policy?.duration_days)));
    setIsActive(Boolean(policy?.is_active ?? true));
  }, [open, policy]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (isNew && !key.trim()) throw new Error("Anahtar gerekli.");
      const fields = {
        coin_amount: Number(coins.replace(",", ".")) || 0,
        question_amount: Number(questions) || 0,
        duration_days: Number(durationDays) || 0,
        is_active: isActive,
      };
      if (policy)
        return auditedUpdate({
          schema: "public",
          table: "wallet_bonus_policies",
          id: String(policy.key),
          idColumn: "key",
          fields,
          action: "edit_bonus",
        });
      return auditedInsert({
        schema: "public",
        table: "wallet_bonus_policies",
        values: { key: key.trim(), ...fields },
        action: "create_bonus",
      });
    },
    onSuccess: () => {
      toast.success(isNew ? "Politika oluşturuldu" : "Kaydedildi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Gift className="h-4 w-4" /> {isNew ? "Yeni Bonus Politikası" : "Politikayı Düzenle"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Anahtar (key)">
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              disabled={!isNew}
              className="font-mono"
              placeholder="welcome_bonus"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kredi">
              <Input value={coins} onChange={(e) => setCoins(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Soru">
              <Input
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="Süre (gün)">
              <Input
                value={durationDays}
                onChange={(e) => setDurationDays(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="flex items-center justify-between rounded-md border px-3 py-2">
            <Label className="text-sm">Aktif</Label>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            disabled={(isNew && !key.trim()) || saveMut.isPending}
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
