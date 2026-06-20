import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

// ---------------------------------------------------------------------------
// Supabase Storage yönetimi (service_role) — v2 yerel indirme klasörünün web
// karşılığı. APK/dosya dağıtımı bir Storage bucket'ı üzerinden yönetilir.
// ---------------------------------------------------------------------------

type StorageObject = {
  name: string;
  id?: string;
  updated_at?: string;
  created_at?: string;
  metadata?: { size?: number; mimetype?: string };
};

export const storageBucketsFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(async (): Promise<{ buckets: { name: string; public: boolean }[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.storage.listBuckets();
    if (error) throw new Error(error.message);
    return { buckets: (data ?? []).map((b) => ({ name: b.name, public: b.public })) };
  });

export const storageListFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    if (typeof i.bucket !== "string" || !i.bucket) throw new Error("bucket gerekli.");
    return { bucket: i.bucket, prefix: typeof i.prefix === "string" ? i.prefix : "" };
  })
  .handler(async ({ data }): Promise<{ objects: StorageObject[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: list, error } = await supabaseAdmin.storage
      .from(data.bucket)
      .list(data.prefix, { limit: 1000, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw new Error(error.message);
    return { objects: (list ?? []) as StorageObject[] };
  });

export const storagePublicUrlFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    if (!i.bucket || !i.path) throw new Error("bucket/path gerekli.");
    return { bucket: String(i.bucket), path: String(i.path) };
  })
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Public bucket → public URL; aksi halde 1 saatlik imzalı URL.
    const { data: pub } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(data.path);
    const { data: signed } = await supabaseAdmin.storage
      .from(data.bucket)
      .createSignedUrl(data.path, 3600);
    return { url: signed?.signedUrl ?? pub.publicUrl };
  });

export const storageUploadFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    if (!i.bucket || !i.path || typeof i.base64 !== "string")
      throw new Error("bucket/path/base64 gerekli.");
    return {
      bucket: String(i.bucket),
      path: String(i.path),
      base64: i.base64,
      contentType: typeof i.contentType === "string" ? i.contentType : "application/octet-stream",
    };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const buffer = Buffer.from(data.base64, "base64");
    const { error } = await supabaseAdmin.storage
      .from(data.bucket)
      .upload(data.path, buffer, { contentType: data.contentType, upsert: true });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const storageDeleteFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) => {
    const i = (raw ?? {}) as Record<string, unknown>;
    if (!i.bucket || !i.path) throw new Error("bucket/path gerekli.");
    return { bucket: String(i.bucket), path: String(i.path) };
  })
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.storage.from(data.bucket).remove([data.path]);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
