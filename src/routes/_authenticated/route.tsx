import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getUser().then(({ data, error }) => {
      if (!mounted) return;
      if (error || !data.user) {
        navigate({ to: "/auth", replace: true });
        return;
      }
      setChecked(true);
    });
    return () => {
      mounted = false;
    };
  }, [navigate]);

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Yükleniyor…
      </div>
    );
  }
  return <Outlet />;
}
