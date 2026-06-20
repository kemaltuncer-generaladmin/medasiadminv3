import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Bolt, Gift, Pencil, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  AggregateKpiCard,
  CountKpiCard,
  formatNumber,
  numberValue,
} from "@/components/admin/live-data";
import { selectRows, auditedUpdate, auditedDelete, type JsonRow } from "@/lib/supabase-rest";
import {
  adjustUserQuotas,
  notifyUser,
  wittyCreditMessage,
  wittyPackageMessage,
} from "@/lib/user-grants";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/kullanicilar")({
  component: Kullanicilar,
});

const PROFILE_SELECT =
  "id,email,phone,first_name,last_name,class_level,target,package_name,question_quota,ai_quota,wallet_balance,is_admin,created_at,updated_at";

function displayName(u: JsonRow) {
  const name = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return name || (u.email as string) || (u.id as string);
}

function fmtDate(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("tr-TR", { dateStyle: "medium", timeStyle: "short" });
}

function fmtRelative(value: unknown) {
  if (!value) return "—";
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} sa önce`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} gün önce`;
  return d.toLocaleDateString("tr-TR", { dateStyle: "medium" });
}

function Kullanicilar() {
  const search = useSearch({ strict: false }) as { q?: string };
  const [localQ, setLocalQ] = useState(search.q ?? "");
  const [packageFilter, setPackageFilter] = useState<string>("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ["users-360", "list"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "profiles",
        select: PROFILE_SELECT,
        rawQuery: "order=updated_at.desc",
        limit: 3000,
      }),
    retry: false,
  });

  const users = usersQuery.data?.data ?? [];

  const packages = useMemo(
    () =>
      Array.from(
        new Set(users.map((u) => u.package_name as string).filter((p) => p && p !== "Free")),
      ).sort(),
    [users],
  );

  const filtered = useMemo(() => {
    let rows = users;
    if (packageFilter) rows = rows.filter((u) => u.package_name === packageFilter);
    const q = localQ.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((u) =>
      [u.email, displayName(u), u.phone, u.target, u.id].some((f) =>
        String(f ?? "")
          .toLowerCase()
          .includes(q),
      ),
    );
  }, [users, packageFilter, localQ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kullanıcılar"
        description={`${users.length} ortak hesap • 360° görünüm`}
        icon={Users}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <CountKpiCard label="Kullanıcı" schema="public" table="profiles" />
        <CountKpiCard
          label="Admin"
          schema="public"
          table="profiles"
          rawQuery="is_admin=eq.true"
          tone="info"
        />
        <AggregateKpiCard
          label="Toplam MC"
          schema="public"
          table="profiles"
          select="id,wallet_balance"
          compute={(rows) =>
            formatNumber(rows.reduce((s, r) => s + numberValue(r.wallet_balance), 0))
          }
          tone="success"
        />
        <CountKpiCard label="Push token" schema="public" table="push_device_tokens" />
      </div>

      <SectionCard
        title="Kullanıcı listesi"
        description={localQ ? `"${localQ}" araması` : "E-posta, ad, telefon veya ID ile ara"}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Input
            placeholder="E-posta, ad, telefon, ID…"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            className="h-9 max-w-xs"
          />
          {packages.length > 0 && (
            <Select
              value={packageFilter || "__all"}
              onValueChange={(v) => setPackageFilter(v === "__all" ? "" : v)}
            >
              <SelectTrigger className="h-9 w-48">
                <SelectValue placeholder="Paket" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">Tüm paketler</SelectItem>
                {packages.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Badge variant="outline" className="ml-auto">
            {filtered.length} kayıt
          </Badge>
        </div>

        {usersQuery.isLoading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
          </div>
        ) : usersQuery.error ? (
          <div className="py-6 text-sm text-destructive">
            {String((usersQuery.error as Error).message).slice(0, 200)}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto rounded-md border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead>Kullanıcı</TableHead>
                  <TableHead>Paket</TableHead>
                  <TableHead>Son görülme</TableHead>
                  <TableHead className="text-right">Bakiye</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.slice(0, 500).map((u) => (
                  <TableRow
                    key={String(u.id)}
                    className="cursor-pointer"
                    onClick={() => setSelectedId(String(u.id))}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-info/80 text-xs font-bold text-white">
                          {displayName(u).slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{displayName(u)}</div>
                          <div className="truncate text-xs text-muted-foreground">
                            {(u.email as string) ?? String(u.id)}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {u.is_admin === true && (
                          <Badge
                            variant="outline"
                            className="border-violet-400/40 bg-violet-400/10 text-violet-500"
                          >
                            admin
                          </Badge>
                        )}
                        {Boolean(u.package_name) && u.package_name !== "Free" && (
                          <StatusBadge status={String(u.package_name)} />
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {fmtRelative(u.updated_at)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm font-bold text-success">
                      {formatNumber(numberValue(u.wallet_balance))} kr
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </SectionCard>

      <Sheet open={selectedId !== null} onOpenChange={(o) => !o && setSelectedId(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          {selectedId && <User360 userId={selectedId} onClose={() => setSelectedId(null)} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function User360({ userId, onClose }: { userId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [packageSel, setPackageSel] = useState<string>("");
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const refreshUsers = () => qc.invalidateQueries({ queryKey: ["users-360", "list"] });

  const userQuery = useQuery({
    queryKey: ["users-360", "one", userId],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "profiles",
        select: PROFILE_SELECT,
        rawQuery: `id=eq.${userId}`,
        limit: 1,
      }),
    retry: false,
  });
  const user = userQuery.data?.data?.[0];

  const ents = useQuery({
    queryKey: ["users-360", "ents", userId],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "wallet_entitlements",
        rawQuery: `user_id=eq.${userId}&order=created_at.desc`,
        limit: 25,
      }),
    retry: false,
  });
  const purchases = useQuery({
    queryKey: ["users-360", "purch", userId],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "purchases",
        rawQuery: `user_id=eq.${userId}&order=created_at.desc`,
        limit: 25,
      }),
    retry: false,
  });
  const devices = useQuery({
    queryKey: ["users-360", "dev", userId],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "push_device_tokens",
        rawQuery: `user_id=eq.${userId}&order=last_seen_at.desc`,
        limit: 15,
      }),
    retry: false,
  });
  const tickets = useQuery({
    queryKey: ["users-360", "tix", userId],
    queryFn: () =>
      selectRows({
        schema: "sourcebase",
        table: "support_tickets",
        rawQuery: `owner_user_id=eq.${userId}&order=created_at.desc`,
        limit: 15,
      }),
    retry: false,
  });
  const contacts = useQuery({
    queryKey: ["users-360", "contacts", userId],
    queryFn: () =>
      selectRows({
        schema: "praticase",
        table: "contact_requests",
        rawQuery: `user_id=eq.${userId}&order=created_at.desc`,
        limit: 15,
      }),
    retry: false,
  });
  const products = useQuery({
    queryKey: ["users-360", "products"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "store_products",
        rawQuery: "is_active=eq.true&order=sort_order.asc",
        limit: 100,
      }),
    retry: false,
  });
  const history = useQuery({
    queryKey: ["users-360", "history", userId],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "admin_action_logs",
        rawQuery: `target_id=eq.${userId}&order=created_at.desc`,
        limit: 30,
      }),
    retry: false,
  });

  const refreshUser = () => {
    userQuery.refetch();
    history.refetch();
    refreshUsers();
  };

  const adjustMut = useMutation({
    mutationFn: async (delta: number) => {
      // Cüzdan kredisi = wallet_delta → gerçek entitlement oluşur, kullanıcıya düşer.
      await adjustUserQuotas({
        targetUserId: userId,
        walletDelta: delta,
        note: "Panelden kredi düzenleme",
      });
      const msg = wittyCreditMessage(delta);
      await notifyUser({ targetUserId: userId, ...msg });
      return numberValue(user?.wallet_balance) + delta;
    },
    onSuccess: (n) => {
      setAmount("");
      refreshUser();
      toast.success(`Kredi işlendi · yeni bakiye ~${formatNumber(n)} · kullanıcıya bildirim gitti`);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const packageMut = useMutation({
    mutationFn: async (productId: string) => {
      const p = (products.data?.data ?? []).find((x) => String(x.id) === productId);
      if (!p || !user) throw new Error("Paket bulunamadı.");
      const coin = numberValue(p.coin_amount);
      const question = numberValue(p.question_amount);
      const ai = numberValue(p.ai_question_amount);
      // Tek RPC ile coin + soru + AI hakkı → entitlement oluşur + profil senkronlanır.
      await adjustUserQuotas({
        targetUserId: userId,
        walletDelta: coin,
        questionDelta: question,
        aiDelta: ai,
        note: `Paket uygula: ${String(p.name)}`,
      });
      const msg = wittyPackageMessage(String(p.name), coin, question, ai);
      await notifyUser({ targetUserId: userId, ...msg, data: { package: String(p.name) } });
      return String(p.name);
    },
    onSuccess: (name) => {
      setPackageSel("");
      refreshUser();
      toast.success(`${name} paketi uygulandı · kullanıcıya bildirim gitti`);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const adminMut = useMutation({
    mutationFn: async (value: boolean) => {
      await adjustUserQuotas({
        targetUserId: userId,
        setIsAdmin: value,
        note: "Panelden yönetici yetkisi",
      });
      return value;
    },
    onSuccess: (v) => {
      refreshUser();
      toast.success(v ? "Yönetici yapıldı" : "Yönetici yetkisi alındı");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const deleteMut = useMutation({
    mutationFn: async () =>
      auditedDelete({ schema: "public", table: "profiles", id: userId, action: "delete_user" }),
    onSuccess: () => {
      refreshUsers();
      toast.success("Kullanıcı silindi");
      onClose();
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  if (!user) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Kullanıcı yükleniyor…
      </div>
    );
  }

  const parsedAmount = Number(amount.replace(",", "."));
  const amountValid = amount.trim() !== "" && Number.isFinite(parsedAmount);

  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle>{displayName(user)}</SheetTitle>
        <SheetDescription className="font-mono text-xs">
          {(user.email as string) ?? String(user.id)}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-5">
        <div className="flex items-start justify-between rounded-lg border bg-card p-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-3xl font-bold text-success">
                {formatNumber(numberValue(user.wallet_balance))}
              </span>
              <span className="text-xs text-muted-foreground">kredi</span>
            </div>
            <div className="mt-1 flex gap-1.5">
              {user.target ? <Badge variant="outline">{String(user.target)}</Badge> : null}
              {user.class_level ? (
                <Badge variant="outline">{String(user.class_level)}</Badge>
              ) : null}
            </div>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <div>Soru {formatNumber(numberValue(user.question_quota))}</div>
            <div>AI {formatNumber(numberValue(user.ai_quota))}</div>
          </div>
        </div>

        <SectionCard title="Hızlı Aksiyonlar">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs">Kredi ekle / düş (negatif = düş)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Miktar"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="h-9"
                />
                <Button
                  size="sm"
                  className="shrink-0"
                  disabled={!amountValid || adjustMut.isPending}
                  onClick={() => adjustMut.mutate(parsedAmount)}
                >
                  {adjustMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Bolt className="h-4 w-4" />
                  )}{" "}
                  Uygula
                </Button>
              </div>
              <div className="flex gap-1.5">
                {[10, 50, 100, 250].map((q) => (
                  <Button
                    key={q}
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => setAmount(String(q))}
                  >
                    +{q}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Paket uygula (kredi + kota)</Label>
              <div className="flex gap-2">
                <Select value={packageSel} onValueChange={setPackageSel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Paket seç…" />
                  </SelectTrigger>
                  <SelectContent>
                    {(products.data?.data ?? []).map((p) => (
                      <SelectItem key={String(p.id)} value={String(p.id)}>
                        {String(p.name)} · {formatNumber(numberValue(p.coin_amount))} kr
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="secondary"
                  className="shrink-0"
                  disabled={!packageSel || packageMut.isPending}
                  onClick={() => packageMut.mutate(packageSel)}
                >
                  {packageMut.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Gift className="h-4 w-4" />
                  )}{" "}
                  Tanımla
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-500" />
                <div>
                  <div className="text-sm font-medium">Yönetici yetkisi</div>
                  <div className="text-xs text-muted-foreground">is_admin</div>
                </div>
              </div>
              <Switch
                checked={user.is_admin === true}
                disabled={adminMut.isPending}
                onCheckedChange={(v) => adminMut.mutate(v)}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard
          title="Profil"
          actions={
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setEditOpen(true)}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          }
        >
          <dl className="divide-y text-sm">
            <KV k="Kullanıcı ID" v={String(user.id)} mono />
            <KV k="E-posta" v={(user.email as string) ?? "—"} />
            <KV k="Telefon" v={(user.phone as string) ?? "—"} />
            <KV k="Paket" v={(user.package_name as string) ?? "—"} />
            <KV k="Kayıt" v={fmtDate(user.created_at)} />
            <KV k="Son görülme" v={fmtDate(user.updated_at)} />
          </dl>
        </SectionCard>

        <ListCard
          title="Hak Edişler"
          loading={ents.isLoading}
          rows={ents.data?.data ?? []}
          empty="Kayıt yok"
          render={(e) => (
            <Row
              key={String(e.id)}
              left={String(e.product_code ?? e.entitlement_type ?? "—")}
              sub={`${e.source ?? ""} • ${fmtRelative(e.created_at)}`}
              right={`${formatNumber(numberValue(e.remaining_coin_amount))}/${formatNumber(numberValue(e.original_coin_amount))} kr`}
            />
          )}
        />

        <ListCard
          title="Satın Almalar"
          loading={purchases.isLoading}
          rows={(purchases.data?.data ?? []).slice(0, 12)}
          empty="Kayıt yok"
          render={(p) => (
            <Row
              key={String(p.id)}
              left={String(p.provider ?? "—")}
              sub={fmtRelative(p.created_at)}
              rightNode={<StatusBadge status={String(p.status ?? "—")} />}
            />
          )}
        />

        <ListCard
          title="Cihazlar"
          loading={devices.isLoading}
          rows={devices.data?.data ?? []}
          empty="Kayıt yok"
          render={(d) => (
            <Row
              key={String(d.id)}
              left={`${d.platform ?? "—"} • ${d.app_version ?? "—"}`}
              sub={`son: ${fmtRelative(d.last_seen_at)}`}
              rightNode={<StatusBadge status={d.is_active === true ? "aktif" : "pasif"} />}
            />
          )}
        />

        <SectionCard title="Destek Geçmişi">
          {(tickets.data?.data ?? []).length === 0 && (contacts.data?.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Kayıt yok</div>
          ) : (
            <div className="space-y-3">
              {(tickets.data?.data ?? []).map((t) => (
                <SupportRow
                  key={String(t.id)}
                  title={String(t.topic ?? "Destek")}
                  message={t.message}
                  status={t.status}
                  date={t.created_at}
                />
              ))}
              {(contacts.data?.data ?? []).map((c) => (
                <SupportRow
                  key={String(c.id)}
                  title={String(c.subject ?? "İletişim")}
                  message={c.message}
                  status={c.status}
                  date={c.created_at}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Son İşlemler (denetim)">
          {(history.data?.data ?? []).length === 0 ? (
            <div className="text-sm text-muted-foreground">Kayıt yok</div>
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {(history.data?.data ?? []).slice(0, 12).map((a) => (
                <li key={String(a.id)} className="relative">
                  <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-primary" />
                  <div className="text-sm font-medium">{String(a.action ?? "işlem")}</div>
                  <div className="text-xs text-muted-foreground">{fmtRelative(a.created_at)}</div>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>

      <ProfileEditor user={user} open={editOpen} onOpenChange={setEditOpen} onSaved={refreshUser} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Bu kullanıcı kalıcı olarak silinsin mi?</AlertDialogTitle>
            <AlertDialogDescription>
              {displayName(user)} ({(user.email as string) ?? String(user.id)}) — bu işlem geri
              alınamaz.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Vazgeç</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteMut.mutate()}
            >
              Kullanıcıyı Sil
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function ListCard({
  title,
  rows,
  loading,
  empty,
  render,
}: {
  title: string;
  rows: JsonRow[];
  loading: boolean;
  empty: string;
  render: (row: JsonRow) => React.ReactNode;
}) {
  return (
    <SectionCard title={title} description={rows.length ? `${rows.length} kayıt` : undefined}>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-sm text-muted-foreground">{empty}</div>
      ) : (
        <div className="divide-y">{rows.map(render)}</div>
      )}
    </SectionCard>
  );
}

function Row({
  left,
  sub,
  right,
  rightNode,
}: {
  left: string;
  sub?: string;
  right?: string;
  rightNode?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">{left}</div>
        {sub ? <div className="truncate text-xs text-muted-foreground">{sub}</div> : null}
      </div>
      {rightNode ??
        (right ? (
          <span className="shrink-0 font-mono text-xs font-bold text-success">{right}</span>
        ) : null)}
    </div>
  );
}

function SupportRow({
  title,
  message,
  status,
  date,
}: {
  title: string;
  message: unknown;
  status: unknown;
  date: unknown;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{title}</span>
        <StatusBadge status={String(status ?? "—")} />
      </div>
      {message ? (
        <p className="line-clamp-2 text-xs text-muted-foreground">{String(message)}</p>
      ) : null}
      <div className="text-xs text-muted-foreground">{fmtRelative(date)}</div>
    </div>
  );
}

function ProfileEditor({
  user,
  open,
  onOpenChange,
  onSaved,
}: {
  user: JsonRow;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [packageName, setPackageName] = useState("");
  const [target, setTarget] = useState("");
  const [classLevel, setClassLevel] = useState("");

  useEffect(() => {
    if (open) {
      setEmail((user.email as string) ?? "");
      setFirstName((user.first_name as string) ?? "");
      setLastName((user.last_name as string) ?? "");
      setPackageName((user.package_name as string) ?? "");
      setTarget((user.target as string) ?? "");
      setClassLevel((user.class_level as string) ?? "");
    }
  }, [open, user]);

  const saveMut = useMutation({
    mutationFn: async () =>
      auditedUpdate({
        schema: "public",
        table: "profiles",
        id: String(user.id),
        fields: {
          email: email || null,
          first_name: firstName,
          last_name: lastName,
          package_name: packageName || "Free",
          target: target || "TUS",
          class_level: classLevel || "Mezun",
        },
        action: "edit_profile",
        targetUserId: String(user.id),
      }),
    onSuccess: () => {
      toast.success("Profil güncellendi");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profili Düzenle</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="E-posta">
            <Input value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Ad">
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </Field>
            <Field label="Soyad">
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Paket">
              <Input value={packageName} onChange={(e) => setPackageName(e.target.value)} />
            </Field>
            <Field label="Hedef">
              <Input value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <Field label="Sınıf">
              <Input value={classLevel} onChange={(e) => setClassLevel(e.target.value)} />
            </Field>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Kaydet
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
