import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { BellRing, Loader2, Plus, Send, MoreVertical, Megaphone } from "lucide-react";
import { PageHeader, SectionCard, StatusBadge } from "@/components/admin/shared";
import {
  selectRows,
  auditedInsert,
  auditedDelete,
  auditedUpdate,
  insertRows,
  rpc,
  currentUserId,
  type JsonRow,
} from "@/lib/supabase-rest";
import { fmtRelative } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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

export const Route = createFileRoute("/_authenticated/admin/bildirimler")({
  component: Bildirimler,
});

const SCHEMA = "praticase" as const;

function Bildirimler() {
  const qc = useQueryClient();
  const [announceOpen, setAnnounceOpen] = useState(false);
  const [campaignOpen, setCampaignOpen] = useState(false);

  const announcementsQ = useQuery({
    queryKey: ["notif", "announcements"],
    queryFn: () =>
      selectRows({
        schema: SCHEMA,
        table: "announcements",
        rawQuery: "order=published_at.desc",
        limit: 200,
      }),
    retry: false,
  });
  const campaignsQ = useQuery({
    queryKey: ["notif", "campaigns"],
    queryFn: () =>
      selectRows({
        schema: SCHEMA,
        table: "notification_campaigns",
        rawQuery: "order=created_at.desc",
        limit: 200,
      }),
    retry: false,
  });

  const announcements = announcementsQ.data?.data ?? [];
  const campaigns = campaignsQ.data?.data ?? [];

  const toggleMut = useMutation({
    mutationFn: (a: JsonRow) =>
      auditedUpdate({
        schema: SCHEMA,
        table: "announcements",
        id: String(a.id),
        fields: { is_active: !(a.is_active ?? true) },
        action: "toggle_announcement",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif", "announcements"] });
      toast.success("Güncellendi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });
  const deleteMut = useMutation({
    mutationFn: (a: JsonRow) =>
      auditedDelete({
        schema: SCHEMA,
        table: "announcements",
        id: String(a.id),
        action: "delete_announcement",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif", "announcements"] });
      toast.success("Silindi");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bildirim & Duyuru"
        description="Uygulama içi duyurular ve push kampanyaları"
        icon={BellRing}
      />

      <Tabs defaultValue="announcements">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="announcements">Duyurular</TabsTrigger>
            <TabsTrigger value="campaigns">Bildirim Kampanyaları</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="announcements" className="mt-4">
          <SectionCard
            title="Duyurular"
            description="praticase.announcements"
            actions={
              <Button size="sm" onClick={() => setAnnounceOpen(true)}>
                <Plus className="mr-1.5 h-4 w-4" /> Yeni Duyuru
              </Button>
            }
          >
            {announcementsQ.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
              </div>
            ) : announcements.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">Duyuru yok.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Duyuru</TableHead>
                    <TableHead>Tarih</TableHead>
                    <TableHead>Durum</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {announcements.map((a) => (
                    <TableRow key={String(a.id)}>
                      <TableCell>
                        <div className="text-sm font-medium">{String(a.title ?? "—")}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {String(a.body ?? "")}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {fmtRelative(a.published_at)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={(a.is_active ?? true) ? "active" : "inactive"} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => toggleMut.mutate(a)}>
                              {(a.is_active ?? true) ? "Pasifleştir" : "Aktifleştir"}
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteMut.mutate(a)}
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
        </TabsContent>

        <TabsContent value="campaigns" className="mt-4">
          <SectionCard
            title="Bildirim Kampanyaları"
            description="praticase.notification_campaigns"
            actions={
              <Button size="sm" onClick={() => setCampaignOpen(true)}>
                <Send className="mr-1.5 h-4 w-4" /> Bildirim Gönder
              </Button>
            }
          >
            {campaignsQ.isLoading ? (
              <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Yükleniyor…
              </div>
            ) : campaigns.length === 0 ? (
              <div className="py-6 text-sm text-muted-foreground">Kampanya yok.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Kampanya</TableHead>
                    <TableHead>Kitle</TableHead>
                    <TableHead>Gönderim</TableHead>
                    <TableHead>Durum</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {campaigns.map((c) => (
                    <TableRow key={String(c.id)}>
                      <TableCell>
                        <div className="text-sm font-medium">{String(c.title ?? "—")}</div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">
                          {String(c.body ?? "")}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {c.audience === "all" ? "herkes" : String(c.audience ?? "—")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {c.sent_at ? `gönderildi ${fmtRelative(c.sent_at)}` : "taslak"}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={(c.is_active ?? true) ? "active" : "inactive"} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>

      <AnnounceDialog
        open={announceOpen}
        onOpenChange={setAnnounceOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["notif", "announcements"] })}
      />
      <CampaignDialog
        open={campaignOpen}
        onOpenChange={setCampaignOpen}
        onSaved={() => qc.invalidateQueries({ queryKey: ["notif", "campaigns"] })}
      />
    </div>
  );
}

function AnnounceDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [icon, setIcon] = useState("badge");

  const saveMut = useMutation({
    mutationFn: () =>
      auditedInsert({
        schema: SCHEMA,
        table: "announcements",
        values: { title, body, icon_key: icon || null, is_active: true },
        action: "create_announcement",
      }),
    onSuccess: () => {
      toast.success("Duyuru yayınlandı");
      onSaved();
      onOpenChange(false);
      setTitle("");
      setBody("");
      setIcon("badge");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-4 w-4" /> Yeni Duyuru
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Başlık">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="İkon anahtarı (ops.)">
            <Input value={icon} onChange={(e) => setIcon(e.target.value)} />
          </Field>
          <Field label="Metin">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={!title.trim() || saveMut.isPending} onClick={() => saveMut.mutate()}>
            {saveMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Yayınla
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CampaignDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
}) {
  const [mode, setMode] = useState<"all" | "user" | "segment">("all");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [segmentField, setSegmentField] = useState<"package_name" | "target">("package_name");
  const [segmentValue, setSegmentValue] = useState("");
  const [deepLink, setDeepLink] = useState("/notifications");

  const sendMut = useMutation({
    mutationFn: async () => {
      const createdBy = await currentUserId();
      if (mode === "all") {
        const inserted = await insertRows(SCHEMA, "notification_campaigns", {
          title,
          body,
          audience: "all",
          is_active: true,
          ...(deepLink ? { deep_link: deepLink } : {}),
          ...(createdBy ? { created_by: createdBy } : {}),
        });
        const campaignId = (inserted.data as JsonRow[])[0]?.id;
        let materialized = false;
        if (campaignId) {
          try {
            await rpc(SCHEMA, "materialize_notification_campaign", {
              p_campaign_id: String(campaignId),
            });
            materialized = true;
          } catch {
            /* zamanlı dağıtım */
          }
        }
        return { kind: "all" as const, materialized };
      }
      if (mode === "user") {
        const found = await selectRows({
          schema: "public",
          table: "profiles",
          select: "id,email",
          rawQuery: `email=eq.${email.trim()}`,
          limit: 1,
        });
        const u = found.data[0];
        if (!u) throw new Error("Kullanıcı bulunamadı.");
        await insertRows("public", "notification_messages", {
          audience_type: "user",
          target_user_id: u.id,
          title,
          body,
          ...(createdBy ? { created_by: createdBy } : {}),
        });
        return { kind: "user" as const, email: String(u.email ?? email) };
      }
      // segment
      const users = await selectRows({
        schema: "public",
        table: "profiles",
        select: "id",
        rawQuery: `${segmentField}=eq.${segmentValue.trim()}`,
        limit: 5000,
      });
      if (users.data.length === 0) return { kind: "segment" as const, count: 0 };
      const rows = users.data.map((u) => ({
        audience_type: "user",
        target_user_id: u.id,
        title,
        body,
        ...(createdBy ? { created_by: createdBy } : {}),
      }));
      await insertRows("public", "notification_messages", rows);
      return { kind: "segment" as const, count: users.data.length };
    },
    onSuccess: (r) => {
      if (r.kind === "all")
        toast.success(
          r.materialized ? "Bildirim dağıtıldı" : "Kampanya oluşturuldu (zamanlı dağıtım)",
        );
      else if (r.kind === "user") toast.success(`${r.email} → bildirim gönderildi`);
      else
        toast[r.count > 0 ? "success" : "info"](
          r.count > 0 ? `${r.count} kullanıcıya gönderildi` : "Eşleşen kullanıcı yok",
        );
      onSaved();
      onOpenChange(false);
      setTitle("");
      setBody("");
      setEmail("");
      setSegmentValue("");
    },
    onError: (e) => toast.error(String((e as Error).message).slice(0, 200)),
  });

  const canSend =
    title.trim() &&
    body.trim() &&
    (mode === "all" || (mode === "user" ? email.trim() : segmentValue.trim()));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4" /> Bildirim Gönder
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="all">Herkes</TabsTrigger>
              <TabsTrigger value="user">Tek kullanıcı</TabsTrigger>
              <TabsTrigger value="segment">Segment</TabsTrigger>
            </TabsList>
          </Tabs>

          <Field label="Başlık">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          {mode === "user" ? (
            <Field label="Kullanıcı e-postası">
              <Input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="kullanici@eposta"
              />
            </Field>
          ) : mode === "segment" ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Segment alanı">
                <Select
                  value={segmentField}
                  onValueChange={(v) => setSegmentField(v as typeof segmentField)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="package_name">Paket</SelectItem>
                    <SelectItem value="target">Hedef</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Değer">
                <Input
                  value={segmentValue}
                  onChange={(e) => setSegmentValue(e.target.value)}
                  placeholder={segmentField === "package_name" ? "Örn. Premium" : "Örn. TUS"}
                />
              </Field>
            </div>
          ) : (
            <Field label="Deep link">
              <Input value={deepLink} onChange={(e) => setDeepLink(e.target.value)} />
            </Field>
          )}

          <Field label="Mesaj">
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} />
          </Field>

          <p className="text-xs text-muted-foreground">
            {mode === "all"
              ? "Kampanya oluşturulur ve tüm kullanıcılara dağıtılır (materialize)."
              : mode === "user"
                ? "Tek kullanıcının gelen kutusuna doğrudan bildirim (notification_messages)."
                : "Eşleşen her kullanıcıya bir bildirim satırı yazılır. Büyük segmentlerde dikkatli ol."}
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            İptal
          </Button>
          <Button disabled={!canSend || sendMut.isPending} onClick={() => sendMut.mutate()}>
            {sendMut.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Gönder
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
