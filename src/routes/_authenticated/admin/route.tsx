import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger,
  SidebarHeader, SidebarFooter,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Users, Wallet, ShoppingBag, Receipt, LifeBuoy,
  HelpCircle, Database, Stethoscope, Brain, Coins, ListChecks, Heart,
  Activity, FileSearch, Table2, Search, RefreshCcw, AlertTriangle, LogOut, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminLayout,
});

function useAdminGuard() {
  const navigate = useNavigate();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!active) return;
      if (!u.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!active) return;
      if (error || !data) {
        navigate({ to: "/no-access", replace: true });
        return;
      }
      setOk(true);
    })();
    return () => {
      active = false;
    };
  }, [navigate]);
  return ok;
}


const groups = [
  {
    label: "Genel",
    items: [
      { to: "/admin/genel-bakis", label: "Genel Bakış", icon: LayoutDashboard },
      { to: "/admin/kullanicilar", label: "Kullanıcılar", icon: Users },
      { to: "/admin/cuzdan", label: "Cüzdan & Haklar", icon: Wallet },
      { to: "/admin/satin-almalar", label: "Satın Almalar & Katalog", icon: ShoppingBag },
      { to: "/admin/medasipay", label: "MedAsiPay / Dekontlar", icon: Receipt },
      { to: "/admin/destek", label: "Destek & Bildirimler", icon: LifeBuoy },
    ],
  },
  {
    label: "Uygulamalar",
    items: [
      { to: "/admin/qlinik", label: "Qlinik", icon: HelpCircle },
      { to: "/admin/sourcebase", label: "SourceBase", icon: Database },
      { to: "/admin/praticase", label: "PratiCase", icon: Stethoscope },
      { to: "/admin/recall", label: "Recall & Öğrenme Hafızası", icon: Brain },
    ],
  },
  {
    label: "Operasyon",
    items: [
      { to: "/admin/ai-maliyetleri", label: "AI Maliyetleri", icon: Coins },
      { to: "/admin/job-queue", label: "Job Queue & Hatalar", icon: ListChecks },
      { to: "/admin/icerik-sagligi", label: "İçerik Sağlığı", icon: Heart },
      { to: "/admin/servis-sagligi", label: "Deploy / Servis Sağlığı", icon: Activity },
      { to: "/admin/audit", label: "Audit Log", icon: FileSearch },
      { to: "/admin/veri-gezgini", label: "Veri Gezgini", icon: Table2 },
    ],
  },
] as const;

function AdminLayout() {
  const ok = useAdminGuard();
  if (!ok) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Yetki kontrol ediliyor…
      </div>
    );
  }
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AdminSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar />
          <main className="flex-1 p-6 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}


function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="px-3 py-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-sidebar-primary flex items-center justify-center">
            <ShieldCheck className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          <div className="text-sm font-semibold leading-tight">
            MedAsi
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">God Mode Admin</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => {
                  const active = pathname === item.to;
                  const Icon = item.icon;
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton asChild isActive={active}>
                        <Link to={item.to}>
                          <Icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3">
        <SignOutButton />
      </SidebarFooter>
    </Sidebar>
  );
}

function SignOutButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full justify-start text-sidebar-foreground hover:bg-sidebar-accent"
      onClick={async () => {
        await supabase.auth.signOut();
        navigate({ to: "/auth", replace: true });
      }}
    >
      <LogOut className="h-4 w-4 mr-2" /> Çıkış
    </Button>
  );
}

function TopBar() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <header className="h-14 border-b bg-card flex items-center gap-3 px-4 sticky top-0 z-20">
      <SidebarTrigger />
      <div className="relative flex-1 max-w-md">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Kullanıcı ara: e-posta, ad, user id…"
          className="pl-8 h-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && q.trim()) {
              navigate({ to: "/admin/kullanicilar", search: { q: q.trim() } as any });
            }
          }}
        />
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/admin/kullanicilar" })}>
          <Users className="h-4 w-4 mr-1.5" /> Kullanıcı Bul
        </Button>
        <Button variant="outline" size="sm" onClick={() => toast.info("Cüzdan senkron RPC için canlı şema bağlantısı gerekir")}>
          <RefreshCcw className="h-4 w-4 mr-1.5" /> Cüzdan Senkron
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate({ to: "/admin/job-queue" })}>
          <AlertTriangle className="h-4 w-4 mr-1.5" /> Son Hatalar
        </Button>
        <Button variant="default" size="sm" onClick={() => navigate({ to: "/admin/veri-gezgini" })}>
          <Table2 className="h-4 w-4 mr-1.5" /> Veri Gezgini
        </Button>
        <Badge variant="outline" className="ml-2">Salt-okunur</Badge>
      </div>
    </header>
  );
}
