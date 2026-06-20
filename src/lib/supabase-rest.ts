import type { AdminSchema } from "@/lib/admin-config";
import { adminRestFn, type AdminRestMethod } from "@/lib/admin-rest-server";

export type JsonRow = Record<string, unknown>;

type RestMethod = AdminRestMethod;

// All admin reads/writes go through the server-side service_role gateway
// (`adminRestFn`) so RLS is bypassed exactly like v2 and the service_role key
// never ships to the browser. `restRequest` keeps the original signature so the
// many helper functions below remain unchanged.
async function restRequest<T>(
  schema: AdminSchema,
  path: string,
  params: URLSearchParams,
  init?: { method?: RestMethod; body?: string; prefer?: string },
) {
  const method = init?.method ?? "GET";
  const body = init?.body !== undefined ? JSON.parse(init.body) : undefined;

  const result = await adminRestFn({
    data: {
      schema,
      path,
      method,
      query: params.toString(),
      body,
      prefer: init?.prefer,
    },
  });

  return {
    data: result.data as T,
    count: result.count,
  };
}

export function parsePostgrestQuery(raw: string) {
  const params = new URLSearchParams();
  const trimmed = raw.trim();
  if (!trimmed) return params;

  for (const pair of trimmed.split("&")) {
    const [key, ...valueParts] = pair.split("=");
    const name = key?.trim();
    const value = valueParts.join("=").trim();
    if (name && value) params.append(name, value);
  }

  return params;
}

export function searchFilter(query: string, columns: string[]) {
  const q = query.trim().replaceAll(",", " ");
  if (!q || columns.length === 0) return "";
  return `(${columns.map((column) => `${column}.ilike.*${q}*`).join(",")})`;
}

export function withQuery(
  base: string,
  params: Record<string, string | number | boolean | undefined>,
) {
  const next = parsePostgrestQuery(base);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") next.set(key, String(value));
  });
  return next.toString();
}

export async function selectRows({
  schema,
  table,
  select = "*",
  rawQuery = "",
  limit = 100,
}: {
  schema: AdminSchema;
  table: string;
  select?: string;
  rawQuery?: string;
  limit?: number;
}) {
  const params = parsePostgrestQuery(rawQuery);
  if (!params.has("select")) params.set("select", select);
  if (!params.has("limit")) params.set("limit", String(limit));

  return restRequest<JsonRow[]>(schema, table, params);
}

export async function pageRows({
  schema,
  table,
  select = "*",
  rawQuery = "",
  limit = 50,
  offset = 0,
  order,
  ascending = false,
}: {
  schema: AdminSchema;
  table: string;
  select?: string;
  rawQuery?: string;
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
}) {
  const params = parsePostgrestQuery(rawQuery);
  if (!params.has("select")) params.set("select", select);
  if (order && !params.has("order")) params.set("order", `${order}.${ascending ? "asc" : "desc"}`);
  params.set("limit", String(limit));
  params.set("offset", String(offset));

  return restRequest<JsonRow[]>(schema, table, params);
}

export async function countRows(schema: AdminSchema, table: string, rawQuery = "") {
  const params = new URLSearchParams();
  params.set("select", "*");
  params.set("limit", "1");
  parsePostgrestQuery(rawQuery).forEach((value, key) => {
    if (key !== "select" && key !== "limit" && key !== "order") params.append(key, value);
  });
  const result = await restRequest<JsonRow[]>(schema, table, params);
  return result.count ?? result.data.length;
}

export async function distinctValues({
  schema,
  table,
  column,
  limit = 1000,
}: {
  schema: AdminSchema;
  table: string;
  column: string;
  limit?: number;
}) {
  const rows = await selectRows({
    schema,
    table,
    select: column,
    rawQuery: `${column}=not.is.null&limit=${limit}`,
    limit,
  });
  return Array.from(
    new Set(
      rows.data
        .map((row) => row[column])
        .filter((value) => value !== null && value !== undefined)
        .map(String),
    ),
  ).sort((a, b) => a.localeCompare(b, "tr"));
}

export async function insertRows(schema: AdminSchema, table: string, values: JsonRow | JsonRow[]) {
  const body = Array.isArray(values) ? values : values;
  return restRequest<JsonRow[]>(schema, table, new URLSearchParams(), {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRow({
  schema,
  table,
  id,
  idColumn = "id",
  fields,
}: {
  schema: AdminSchema;
  table: string;
  id: string;
  idColumn?: string;
  fields: JsonRow;
}) {
  const params = new URLSearchParams();
  params.set(idColumn, `eq.${id}`);
  return restRequest<JsonRow[]>(schema, table, params, {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function updateWhere({
  schema,
  table,
  rawQuery,
  fields,
}: {
  schema: AdminSchema;
  table: string;
  rawQuery: string;
  fields: JsonRow;
}) {
  return restRequest<JsonRow[]>(schema, table, parsePostgrestQuery(rawQuery), {
    method: "PATCH",
    body: JSON.stringify(fields),
  });
}

export async function deleteRow({
  schema,
  table,
  id,
  idColumn = "id",
}: {
  schema: AdminSchema;
  table: string;
  id: string;
  idColumn?: string;
}) {
  const params = new URLSearchParams();
  params.set(idColumn, `eq.${id}`);
  return restRequest<JsonRow[]>(schema, table, params, { method: "DELETE" });
}

export async function rpc<T = unknown>(schema: AdminSchema, name: string, params: JsonRow) {
  return restRequest<T>(schema, `rpc/${name}`, new URLSearchParams(), {
    method: "POST",
    body: JSON.stringify(params),
  });
}

export async function currentUserId() {
  const { supabase } = await import("@/integrations/supabase/client");
  const { data } = await supabase.auth.getUser();
  return data.user?.id;
}

export async function auditAction({
  action,
  schema,
  table,
  targetId,
  targetUserId,
  before,
  after,
  reason,
}: {
  action: string;
  schema: AdminSchema;
  table: string;
  targetId?: string;
  targetUserId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
}) {
  const actor = await currentUserId();
  try {
    await insertRows("public", "admin_action_logs", {
      action,
      actor_user_id: actor,
      admin_user_id: actor,
      target_user_id: targetUserId,
      target_table: `${schema}.${table}`,
      target_id: targetId,
      before,
      after,
      reason,
      metadata: { schema, table },
    });
  } catch {
    // Some deployments have an older audit schema. Mutations must not fail only
    // because audit logging could not be written.
  }
}

export async function auditedUpdate(
  args: Parameters<typeof updateRow>[0] & {
    action: string;
    reason?: string;
    targetUserId?: string;
  },
) {
  const before = await selectRows({
    schema: args.schema,
    table: args.table,
    rawQuery: `${args.idColumn ?? "id"}=eq.${args.id}`,
    limit: 1,
  })
    .then((result) => result.data[0])
    .catch(() => undefined);
  const result = await updateRow(args);
  await auditAction({
    action: args.action,
    schema: args.schema,
    table: args.table,
    targetId: args.id,
    targetUserId: args.targetUserId,
    before,
    after: result.data[0],
    reason: args.reason,
  });
  return result;
}

export async function auditedInsert(args: {
  schema: AdminSchema;
  table: string;
  values: JsonRow | JsonRow[];
  action: string;
  reason?: string;
  targetUserId?: string;
}) {
  const result = await insertRows(args.schema, args.table, args.values);
  await auditAction({
    action: args.action,
    schema: args.schema,
    table: args.table,
    targetId: String(result.data[0]?.id ?? ""),
    targetUserId: args.targetUserId,
    after: result.data,
    reason: args.reason,
  });
  return result;
}

export async function auditedDelete(
  args: Parameters<typeof deleteRow>[0] & { action: string; reason?: string },
) {
  const before = await selectRows({
    schema: args.schema,
    table: args.table,
    rawQuery: `${args.idColumn ?? "id"}=eq.${args.id}`,
    limit: 1,
  })
    .then((result) => result.data[0])
    .catch(() => undefined);
  const result = await deleteRow(args);
  await auditAction({
    action: args.action,
    schema: args.schema,
    table: args.table,
    targetId: args.id,
    before,
    after: result.data,
    reason: args.reason,
  });
  return result;
}

export async function pingHttpTarget(url: string) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, { method: "GET", cache: "no-store", mode: "cors" });
    return {
      ok: response.ok,
      status: response.status,
      ms: Math.round(performance.now() - startedAt),
      error: response.ok ? undefined : response.statusText,
    };
  } catch (error) {
    return {
      ok: false,
      status: undefined,
      ms: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "Bilinmeyen hata",
    };
  }
}
