import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

// ---------------------------------------------------------------------------
// Server-side admin PostgREST gateway (service_role, RLS bypass).
//
// Every admin read/write in v3 funnels through this one server function so the
// service_role key never reaches the browser — the web equivalent of v2's
// SupabaseService, which used service_role for full multi-schema access.
// The schema is selected per-request via Accept-Profile / Content-Profile.
// ---------------------------------------------------------------------------

export type AdminRestMethod = "GET" | "POST" | "PATCH" | "DELETE";

export type AdminRestInput = {
  schema: string;
  /** Table name or `rpc/<fn>` — relative to /rest/v1/. */
  path: string;
  method?: AdminRestMethod;
  /** Encoded PostgREST query string (without leading `?`). */
  query?: string;
  body?: unknown;
  /** Extra `Prefer` directives, e.g. "resolution=merge-duplicates". */
  prefer?: string;
};

export type AdminRestPayload =
  | string
  | number
  | boolean
  | null
  | AdminRestPayload[]
  | { [key: string]: AdminRestPayload };

export type AdminRestResult<T = AdminRestPayload> = {
  data: T;
  count?: number;
};

function parseContentRange(header: string | null) {
  if (!header) return undefined;
  const total = header.split("/")[1];
  return total && total !== "*" ? Number(total) : undefined;
}

function validateInput(raw: unknown): AdminRestInput {
  if (!raw || typeof raw !== "object") throw new Error("Geçersiz istek.");
  const input = raw as Record<string, unknown>;
  if (typeof input.schema !== "string" || !input.schema) throw new Error("schema gerekli.");
  if (typeof input.path !== "string" || !input.path) throw new Error("path gerekli.");
  const method = (input.method as AdminRestMethod) ?? "GET";
  if (!["GET", "POST", "PATCH", "DELETE"].includes(method)) throw new Error("Geçersiz method.");
  return {
    schema: input.schema,
    path: input.path,
    method,
    query: typeof input.query === "string" ? input.query : "",
    body: input.body,
    prefer: typeof input.prefer === "string" ? input.prefer : undefined,
  };
}

// Raw service_role PostgREST call — server-only. Exported so other server
// functions (AI publish pipeline, etc.) can reuse the same gateway logic
// without going back through the client → serverFn round-trip.
export async function adminRest(input: AdminRestInput): Promise<AdminRestResult> {
  const data = validateInput(input);
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sunucu ortamında eksik.");
  }

  const method = data.method ?? "GET";
  const write = method !== "GET";
  const requestUrl = `${url}/rest/v1/${data.path}${data.query ? `?${data.query}` : ""}`;

  const preferParts = [
    method === "GET" ? "count=exact" : "return=representation",
    data.prefer,
  ].filter(Boolean);

  const response = await fetch(requestUrl, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      [write ? "Content-Profile" : "Accept-Profile"]: data.schema,
      Prefer: preferParts.join(","),
    },
    body: data.body !== undefined ? JSON.stringify(data.body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${message}`);
  }

  const text = await response.text();
  const parsed: unknown = text ? JSON.parse(text) : [];
  return {
    data: parsed as AdminRestPayload,
    count: parseContentRange(response.headers.get("content-range")),
  };
}

export const adminRestFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateInput)
  .handler(async ({ data }) => adminRest(data));
