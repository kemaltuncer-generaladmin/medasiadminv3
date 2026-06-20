import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/no-access")({
  ssr: false,
  component: NoAccess,
});

function NoAccess() {
  useEffect(() => {
    // Just to confirm session still exists
    supabase.auth.getSession();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-sidebar via-background to-sidebar">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto h-12 w-12 rounded-xl bg-destructive/10 flex items-center justify-center">
            <ShieldAlert className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle>Yetki Yok</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            Hesabınız aktif fakat <code className="font-mono">admin</code> yetkisi yok. Bir yönetici
            sizi <code className="font-mono">public.user_roles</code> tablosuna{" "}
            <code className="font-mono">admin</code> olarak eklemeli.
          </p>
          <div className="flex gap-2 justify-center">
            <Button asChild variant="outline">
              <Link to="/auth">Tekrar Giriş</Link>
            </Button>
            <Button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.href = "/auth";
              }}
            >
              Çıkış
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
