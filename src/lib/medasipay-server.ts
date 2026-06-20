import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

// ---------------------------------------------------------------------------
// MedAsiPay (havale/EFT dekont onay akışı) sunucu proxy'si.
//
// v2'de yönetici anahtarı macOS'ta yerel saklanırdı; web'de bu bir sunucu
// secret'ıdır (MEDASIPAY_ADMIN_KEY) ve `X-MedAsi-Admin-Key` başlığıyla
// `odeme.medasi.com.tr` REST API'sine yalnızca sunucudan gönderilir.
// ---------------------------------------------------------------------------

const PAY_BASE = (process.env.MEDASIPAY_BASE_URL ?? "https://odeme.medasi.com.tr").replace(
  /\/$/,
  "",
);

function adminKey() {
  const key = (process.env.MEDASIPAY_ADMIN_KEY ?? "").trim();
  if (!key) {
    throw new Error("MEDASIPAY_ADMIN_KEY sunucu ortamında tanımlı değil.");
  }
  return key;
}

async function payFetch(path: string, init: RequestInit) {
  const response = await fetch(`${PAY_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-MedAsi-Admin-Key": adminKey(),
      ...init.headers,
    },
  });

  if (response.status === 401) throw new Error("MedAsiPay yönetici anahtarı geçersiz.");

  if (!response.ok) {
    let message = `MedAsiPay isteği başarısız (${response.status}).`;
    try {
      const body = (await response.json()) as { error?: string };
      if (body?.error) message = `Hata ${response.status}: ${body.error}`;
    } catch {
      // non-json error body
    }
    throw new Error(message);
  }

  return response;
}

type PayInput = {
  op: "list" | "approve" | "reject" | "grant";
  orderId?: string;
  note?: string;
  reason?: string;
};

function validatePayInput(raw: unknown): PayInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const op = input.op as PayInput["op"];
  if (!["list", "approve", "reject", "grant"].includes(op)) throw new Error("Geçersiz işlem.");
  if (op !== "list" && !input.orderId) throw new Error("orderId gerekli.");
  return {
    op,
    orderId: input.orderId ? String(input.orderId) : undefined,
    note: typeof input.note === "string" ? input.note : undefined,
    reason: typeof input.reason === "string" ? input.reason : undefined,
  };
}

export const medasipayFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validatePayInput)
  .handler(async ({ data, context }) => {
    const actor =
      (context.actorEmail as string | undefined) ??
      process.env.MEDASIPAY_ACTOR ??
      "admin@medasi.com.tr";

    if (data.op === "list") {
      const response = await payFetch("/api/admin/orders", { method: "GET" });
      const json = (await response.json()) as { orders?: unknown[] };
      return { orders: (json.orders ?? []) as Json[] };
    }

    const id = data.orderId as string;
    if (data.op === "approve") {
      const response = await payFetch(`/api/admin/orders/${id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          adminActor: actor,
          adminNote: data.note?.trim() || "Admin panelinden onaylandı.",
        }),
      });
      const json = (await response.json()) as { order?: Record<string, unknown> };
      return { order: (json.order ?? null) as Json };
    }

    if (data.op === "reject") {
      const response = await payFetch(`/api/admin/orders/${id}/reject`, {
        method: "POST",
        body: JSON.stringify({
          adminActor: actor,
          reason: data.reason?.trim() || "Admin panelinden reddedildi.",
        }),
      });
      const json = (await response.json()) as { order?: Record<string, unknown> };
      return { order: (json.order ?? null) as Json };
    }

    // grant-entitlement
    const response = await payFetch(`/api/admin/orders/${id}/grant-entitlement`, {
      method: "POST",
      body: JSON.stringify({ adminActor: actor, adminNote: "Hak tanımı yeniden denendi." }),
    });
    const json = (await response.json()) as { order?: Record<string, unknown> };
    return { order: (json.order ?? null) as Json };
  });

export const medasipayReceiptFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((raw: unknown) => {
    const input = (raw ?? {}) as Record<string, unknown>;
    if (!input.orderId) throw new Error("orderId gerekli.");
    return {
      orderId: String(input.orderId),
      filename: input.filename ? String(input.filename) : undefined,
    };
  })
  .handler(async ({ data }) => {
    const response = await payFetch(`/api/admin/orders/${data.orderId}/receipt`, { method: "GET" });
    const mimeType = response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = await response.arrayBuffer();
    const base64 = Buffer.from(buffer).toString("base64");
    return {
      dataUrl: `data:${mimeType};base64,${base64}`,
      filename: data.filename ?? `dekont-${data.orderId}`,
      mimeType,
    };
  });
