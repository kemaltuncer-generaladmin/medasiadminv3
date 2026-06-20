import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Wallet, Loader2, Plus, MoreVertical, Coins, Ticket, RefreshCcw } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  AggregateKpiCard,
  CountKpiCard,
  LiveTableCard,
  formatNumber,
  numberValue,
} from "@/components/admin/live-data";
import {
  selectRows,
  auditedInsert,
  auditedUpdate,
  auditedDelete,
  type JsonRow,
} from "@/lib/supabase-rest";
import { adjustUserQuotas, notifyUser, wittyCreditMessage } from "@/lib/user-grants";
import { fmtRelative } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/cuzdan")({
  component: Cuzdan,
});

async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function Cuzdan() {
  const qc = useQueryClient();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mağaza & Cüzdan"
        description="Hızlı kredi, hediye kodları ve cüzdan hakları"
        icon={Wallet}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <AggregateKpiCard
          label="Aktif MC"
          schema="public"
          table="wallet_entitlements"
          select="id,remaining_coin_amount,status"
          rawQuery="status=eq.active"
          compute={(rows) =>
            formatNumber(rows.reduce((s, r) => s + numberValue(r.remaining_coin_amount), 0))
          }
        />
        <AggregateKpiCard
          label="Aktif soru hakkı"
          schema="public"
          table="wallet_entitlements"
          select="id,remaining_question_amount,status"
          rawQuery="status=eq.active"
          compute={(rows) =>
            formatNumber(rows.reduce((s, r) => s + numberValue(r.remaining_question_amount), 0))
          }
        />
        <CountKpiCard
          label="Aktif entitlement"
          schema="public"
          table="wallet_entitlements"
          rawQuery="status=eq.active"
          tone="success"
        />
        <CountKpiCard label="Gift code" schema="public" table="gift_codes" />
        <CountKpiCard label="Gift kullanım" schema="public" table="gift_code_redemptions" />
        <CountKpiCard
          label="İptal/Revoked"
          schema="public"
          table="wallet_entitlements"
          rawQuery="status=in.(revoked,cancelled,refunded)"
          tone="destructive"
        />
      </div>

      <QuickCredit onDone={() => qc.invalidateQueries()} />

      <Tabs defaultValue="gifts">
        <TabsList>
          <TabsTrigger value="gifts">Hediye Kodları</TabsTrigger>
          <TabsTrigger value="wallet">Cüzdan Hareketleri</TabsTrigger>
        </TabsList>
        <TabsContent value="gifts" className="mt-4">
          <GiftCodes />
        </TabsContent>
        <TabsContent value="wallet" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <LiveTableCard
              title="wallet_entitlements"
              schema="public"
              table="wallet_entitlements"
              order="created_at"
              limit={25}
            />
            <LiveTableCard
              title="gift_code_redemptions"
              schema="public"
              table="gift_code_redemptions"
              order="redeemed_at"
              limit={25}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function QuickCredit({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [amount, setAmount] = useState("");
  const mut = useMutation({
    mutationFn: async () => {
      const delta = Number(amount.replace(",", "."));
      if (!Number.isFinite(delta) || delta === 0) throw new Error("Geçerli bir miktar gir.");
      const found = await selectRows({
        schema: "public",
        table: "profiles",
        select: "id,email,wallet_balance",
        rawQuery: `email=eq.${email.trim()}`,
        limit: 1,
      });
      const u = found.data[0];
      if (!u) throw new Error("Kullanıcı bulunamadı.");
      // Doğru yol: wallet_delta RPC → gerçek entitlement, kullanıcıya düşer.
      await adjustUserQuotas({
        targetUserId: String(u.id),
        walletDelta: delta,
        note: "E-posta ile hızlı kredi",
      });
      const msg = wittyCreditMessage(delta);
      await notifyUser({ targetUserId: String(u.id), ...msg });
      return { email: String(u.email ?? email), next: numberValue(u.wallet_balance) + delta };
    },
    onSuccess: (r) => {
      setEmail("");
      setAmount("");
      onDone();
      toast.success(`${r.email} → ~${formatNumber(r.next)} MC · kullanıcıya bildirim gitti`);
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="E-posta ile hızlı kredi"
      description="Kullanıcının cüzdan bakiyesine kredi ekle/düş (audit'li)"
    >
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px] space-y-1.5">
          <Label className="text-xs">Kullanıcı e-postası</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kullanici@eposta"
            className="h-9"
          />
        </div>
        <div className="w-40 space-y-1.5">
          <Label className="text-xs">Miktar (negatif = düş)</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            className="h-9"
          />
        </div>
        <Button
          className="h-9"
          disabled={!email.trim() || !amount.trim() || mut.isPending}
          onClick={() => mut.mutate()}
        >
          {mut.isPending ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Coins className="mr-1.5 h-4 w-4" />
          )}{" "}
          Uygula
        </Button>
      </div>
    </SectionCard>
  );
}

function GiftCodes() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<JsonRow | null>(null);

  const giftsQ = useQuery({
    queryKey: ["gift-codes"],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "gift_codes",
        rawQuery: "order=created_at.desc",
        limit: 200,
      }),
    retry: false,
  });
  const gifts = giftsQ.data?.data ?? [];
  const invalidate = () => qc.invalidateQueries({ queryKey: ["gift-codes"] });

  const toggleMut = useMutation({
    mutationFn: (g: JsonRow) =>
      auditedUpdate({
        schema: "public",
        table: "gift_codes",
        id: String(g.id),
        fields: { is_active: !(g.is_active ?? true) },
        action: "toggle_gift",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (g: JsonRow) =>
      auditedDelete({
        schema: "public",
        table: "gift_codes",
        id: String(g.id),
        action: "delete_gift",
      }),
    onSuccess: () => {
      invalidate();
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <SectionCard
      title="Hediye Kodları"
      description="SHA-256 hash ile güvenli kodlar"
      actions={
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="mr-1.5 h-4 w-4" /> Yeni Kod
        </Button>
      }
    >
      {giftsQ.isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
        </div>
      ) : gifts.length === 0 ? (
        <div className="py-6 text-sm text-muted-foreground">Hediye kodu yok.</div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Kod / Başlık</TableHead>
              <TableHead>Haklar</TableHead>
              <TableHead>Kullanım</TableHead>
              <TableHead>Durum</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {gifts.map((g) => (
              <TableRow
                key={String(g.id)}
                className="cursor-pointer"
                onClick={() => setSelected(g)}
              >
                <TableCell>
                  <div className="font-mono text-sm font-medium">{String(g.code_hint ?? "—")}</div>
                  <div className="text-xs text-muted-foreground">{String(g.title ?? "")}</div>
                </TableCell>
                <TableCell className="text-xs">
                  {numberValue(g.coin_amount)} MC · {numberValue(g.question_amount)} soru ·{" "}
                  {numberValue(g.ai_question_amount)} AI
                </TableCell>
                <TableCell className="text-xs">
                  {numberValue(g.redemption_count ?? g.times_redeemed)}/
                  {numberValue(g.max_redemptions)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={(g.is_active ?? true) ? "active" : "inactive"} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => toggleMut.mutate(g)}>
                        {(g.is_active ?? true) ? "Pasifleştir" : "Aktifleştir"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="text-destructive"
                        onClick={() => deleteMut.mutate(g)}
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

      <GiftEditor open={creating} onOpenChange={setCreating} onSaved={invalidate} />

      <Sheet open={selected !== null} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected ? <GiftDetail gift={selected} /> : null}
        </SheetContent>
      </Sheet>
    </SectionCard>
  );
}

function GiftDetail({ gift }: { gift: JsonRow }) {
  const redemptionsQ = useQuery({
    queryKey: ["gift-redemptions", gift.id],
    queryFn: () =>
      selectRows({
        schema: "public",
        table: "gift_code_redemptions",
        rawQuery: `gift_code_id=eq.${gift.id}&order=redeemed_at.desc`,
        limit: 200,
      }),
    retry: false,
  });
  const redemptions = redemptionsQ.data?.data ?? [];
  return (
    <>
      <SheetHeader className="mb-4">
        <SheetTitle className="font-mono">{String(gift.code_hint ?? "—")}</SheetTitle>
        <SheetDescription>{String(gift.title ?? "")}</SheetDescription>
      </SheetHeader>
      <div className="space-y-4">
        <SectionCard title="Haklar">
          <dl className="divide-y text-sm">
            <KV k="Kredi (MC)" v={String(numberValue(gift.coin_amount))} />
            <KV k="Soru hakkı" v={String(numberValue(gift.question_amount))} />
            <KV k="AI soru hakkı" v={String(numberValue(gift.ai_question_amount))} />
            <KV k="Maks. kullanım" v={String(numberValue(gift.max_redemptions))} />
            <KV k="code_hash" v={String(gift.code_hash ?? "—")} mono />
          </dl>
        </SectionCard>
        <SectionCard
          title="Kullanımlar"
          description={redemptions.length ? `${redemptions.length} kayıt` : undefined}
        >
          {redemptionsQ.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
            </div>
          ) : redemptions.length === 0 ? (
            <div className="text-sm text-muted-foreground">Kullanım yok.</div>
          ) : (
            <div className="divide-y">
              {redemptions.map((r) => (
                <div
                  key={String(r.id)}
                  className="flex items-center justify-between gap-2 py-2 text-xs"
                >
                  <span className="truncate font-mono">{String(r.user_id ?? "—")}</span>
                  <span className="text-muted-foreground">{fmtRelative(r.redeemed_at)}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}

function GiftEditor({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState("");
  const [title, setTitle] = useState("");
  const [coins, setCoins] = useState("0");
  const [questions, setQuestions] = useState("0");
  const [aiQuestions, setAiQuestions] = useState("0");
  const [maxRedemptions, setMaxRedemptions] = useState("1");
  const [note, setNote] = useState("");

  const normalized = useMemo(() => code.toUpperCase().replace(/[^A-Z0-9]/g, ""), [code]);

  function randomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    const arr = new Uint32Array(16);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 16; i++) s += chars[arr[i] % chars.length];
    setCode(s);
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (normalized.length !== 16)
        throw new Error(`Kod tam 16 alfanümerik karakter olmalı (şu an ${normalized.length}).`);
      const c = Number(coins) || 0,
        q = Number(questions) || 0,
        a = Number(aiQuestions) || 0,
        m = Number(maxRedemptions) || 0;
      if (c < 0 || q < 0 || a < 0) throw new Error("Hak miktarları negatif olamaz.");
      if (c === 0 && q === 0 && a === 0)
        throw new Error("En az bir kredi, soru veya AI soru hakkı girilmeli.");
      if (m < 1) throw new Error("Maksimum kullanım en az 1 olmalı.");
      const hash = await sha256Hex(normalized);
      await auditedInsert({
        schema: "public",
        table: "gift_codes",
        values: {
          code_hash: hash,
          code_hint: normalized,
          title: title || normalized,
          note,
          coin_amount: c,
          question_amount: q,
          ai_question_amount: a,
          max_redemptions: Math.max(1, m),
          is_active: true,
        },
        action: "create_gift",
      });
    },
    onSuccess: () => {
      toast.success("Hediye kodu oluşturuldu");
      onSaved();
      onOpenChange(false);
      setCode("");
      setTitle("");
      setCoins("0");
      setQuestions("0");
      setAiQuestions("0");
      setMaxRedemptions("1");
      setNote("");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="h-4 w-4" /> Yeni Hediye Kodu
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Kod (16 alfanümerik)</Label>
            <div className="flex gap-2">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="font-mono uppercase"
                placeholder="ABCD1234EFGH5678"
              />
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 shrink-0"
                onClick={randomCode}
                title="Rastgele üret"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-[11px] text-muted-foreground">
              Normalize: <span className="font-mono">{normalized || "—"}</span> ({normalized.length}
              /16)
            </div>
          </div>
          <Field label="Başlık (ops.)">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Kredi (MC)">
              <Input value={coins} onChange={(e) => setCoins(e.target.value)} inputMode="numeric" />
            </Field>
            <Field label="Soru hakkı">
              <Input
                value={questions}
                onChange={(e) => setQuestions(e.target.value)}
                inputMode="numeric"
              />
            </Field>
            <Field label="AI soru hakkı">
              <Input
                value={aiQuestions}
                onChange={(e) => setAiQuestions(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Maks. kullanım">
              <Input
                value={maxRedemptions}
                onChange={(e) => setMaxRedemptions(e.target.value)}
                inputMode="numeric"
              />
            </Field>
          </div>
          <Field label="Not (ops.)">
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button
            disabled={normalized.length !== 16 || saveMut.isPending}
            onClick={() => saveMut.mutate()}
          >
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Oluştur
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
