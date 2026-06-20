import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

// ---------------------------------------------------------------------------
// Şema kataloğu — PostgREST OpenAPI introspeksiyonu (v2 SchemaCatalog portu).
// Çalışma zamanında tablo/kolon/PK keşfi; Veri Gezgini ve İçe Aktar için.
// ---------------------------------------------------------------------------

export type ColumnMeta = {
  name: string;
  type: string;
  format: string;
  nullable: boolean;
  isPrimaryKey: boolean;
};

type OpenApiProp = { type?: string; format?: string; description?: string };
type OpenApiDef = { properties?: Record<string, OpenApiProp>; required?: string[] };
type OpenApiDoc = { definitions?: Record<string, OpenApiDef> };

function validateInput(raw: unknown) {
  const i = (raw ?? {}) as Record<string, unknown>;
  if (typeof i.schema !== "string" || !i.schema) throw new Error("schema gerekli.");
  return { schema: i.schema, table: typeof i.table === "string" ? i.table : undefined };
}

async function fetchOpenApi(schema: string): Promise<OpenApiDoc> {
  const url = (process.env.SUPABASE_URL ?? "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY eksik.");
  const res = await fetch(`${url}/rest/v1/`, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Accept-Profile": schema,
    },
  });
  if (!res.ok) throw new Error(`Şema kataloğu alınamadı: ${res.status}`);
  return (await res.json()) as OpenApiDoc;
}

function columnsFromDef(def: OpenApiDef): ColumnMeta[] {
  const required = new Set(def.required ?? []);
  return Object.entries(def.properties ?? {}).map(([name, p]) => {
    const desc = p.description ?? "";
    return {
      name,
      type: p.type ?? "string",
      format: p.format ?? "",
      nullable: !required.has(name),
      isPrimaryKey: /Primary Key/i.test(desc),
    };
  });
}

export const schemaCatalogFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateInput)
  .handler(async ({ data }): Promise<{ tables: string[]; columns: ColumnMeta[] }> => {
    const doc = await fetchOpenApi(data.schema);
    const defs = doc.definitions ?? {};
    const tables = Object.keys(defs).sort((a, b) => a.localeCompare(b, "tr"));
    const columns = data.table && defs[data.table] ? columnsFromDef(defs[data.table]) : [];
    return { tables, columns };
  });
