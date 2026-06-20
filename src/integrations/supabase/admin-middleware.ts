import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "./auth-middleware";

// Server-side admin gate. Builds on `requireSupabaseAuth` (validates the bearer
// token and exposes `userId`), then confirms the caller is an admin using the
// service-role client — mirroring v2 where the single admin has full DB access.
//
// Admin = has `admin` role in public.user_roles OR public.profiles.is_admin = true.
// The resolved admin actor id is exposed as `actorUserId` for audit writes and
// god_mode RPCs (v2 Config.adminActorUserId / ADMIN_ACTOR_USER_ID).
export const requireAdmin = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const userId = context.userId as string;
    const { supabaseAdmin } = await import("./client.server");
    // The generated Database types only cover a subset of tables; the admin tool
    // reads arbitrary tables, so these introspective checks use an untyped client.
    type AnyQuery = {
      select: (cols: string) => AnyQuery;
      eq: (col: string, val: unknown) => AnyQuery;
      maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>;
    };
    const db = supabaseAdmin as unknown as { from: (table: string) => AnyQuery };

    const [{ data: roleRow }, { data: profileRow }] = await Promise.all([
      db.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
      db.from("profiles").select("is_admin").eq("id", userId).maybeSingle(),
    ]);

    const isAdmin = Boolean(roleRow) || Boolean(profileRow?.is_admin);
    if (!isAdmin) {
      throw new Error("Forbidden: admin yetkisi gerekli.");
    }

    const claims = context.claims as { email?: string } | undefined;

    return next({
      context: {
        actorUserId: userId,
        actorEmail: claims?.email,
      },
    });
  });
