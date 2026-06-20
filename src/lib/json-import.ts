import type { ColumnMeta } from "@/lib/schema-catalog-server";

// ---------------------------------------------------------------------------
// Şema-tahrikli JSON içe aktarma (v2 JSONImport birebir portu).
// Harici AI/otomasyon çıktısını canlı tablonun kolonlarına göre doğrular,
// eksikleri tamamlar, tanımsız anahtarları atar, tipleri düzeltir.
// ---------------------------------------------------------------------------

export type JsonObj = Record<string, unknown>;

export type ImportRowResult = {
  index: number;
  valid: boolean;
  filled: string[];
  coerced: string[];
  dropped: string[];
  missingRequired: string[];
  normalized: JsonObj;
};

const AUTO_GEN = new Set(["id", "created_at", "updated_at"]);

function isBool(c: ColumnMeta) {
  return c.type === "boolean";
}
function isNumeric(c: ColumnMeta) {
  return c.type === "integer" || c.type === "number";
}
function isArray(c: ColumnMeta) {
  return c.type === "array" || c.format === "array";
}
function isJSON(c: ColumnMeta) {
  return c.type === "object" || /json/i.test(c.format) || /json/i.test(c.type);
}

// --- Parse (dizi / nesne / sarmalayıcı kabul eder, markdown soyar) ---
export function parseRows(text: string): { rows: JsonObj[] | null; error?: string } {
  let v = text.trim();
  if (v.startsWith("```"))
    v = v
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  if (!v) return { rows: null, error: "Boş veya okunamayan metin" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(v);
  } catch {
    return {
      rows: null,
      error: "Geçerli JSON dizisi/nesnesi bulunamadı (markdown/kod bloğu olmadan yapıştır)",
    };
  }
  if (Array.isArray(parsed)) return { rows: parsed as JsonObj[] };
  if (parsed && typeof parsed === "object") {
    const obj = parsed as JsonObj;
    for (const k of ["questions", "items", "data", "rows", "results", "records"]) {
      if (Array.isArray(obj[k]))
        return {
          rows: (obj[k] as unknown[]).filter(
            (x) => x && typeof x === "object" && !Array.isArray(x),
          ) as JsonObj[],
        };
    }
    return { rows: [obj] };
  }
  return { rows: null, error: "Geçerli JSON dizisi/nesnesi bulunamadı" };
}

// --- Tip dönüştürme ("5"→5, "true"→true, sayı→bool) ---
function coerce(value: unknown, col: ColumnMeta): { value: unknown; coerced: boolean } {
  if (isBool(col)) {
    if (typeof value === "boolean") return { value, coerced: false };
    if (typeof value === "string") {
      const l = value.toLowerCase().trim();
      if (["true", "1", "yes", "evet", "doğru"].includes(l)) return { value: true, coerced: true };
      if (["false", "0", "no", "hayır", "yanlış"].includes(l))
        return { value: false, coerced: true };
    }
    if (typeof value === "number") return { value: value !== 0, coerced: true };
  } else if (isNumeric(col)) {
    if (typeof value === "number") return { value, coerced: false };
    if (typeof value === "string") {
      const t = value.replace(",", ".").trim();
      const d = Number(t);
      if (t !== "" && Number.isFinite(d)) return { value: d, coerced: true };
    }
    if (typeof value === "boolean") return { value: value ? 1 : 0, coerced: true };
  }
  return { value, coerced: false };
}

function isEmptyish(v: unknown) {
  return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
}

// --- Doğrulama + onarım ---
export function validate(
  rows: JsonObj[],
  columns: ColumnMeta[],
  defaults: JsonObj,
): ImportRowResult[] {
  const colByName = new Map(columns.map((c) => [c.name, c]));
  const required = columns
    .filter((c) => !c.nullable && !c.isPrimaryKey && !AUTO_GEN.has(c.name))
    .map((c) => c.name);
  return rows.map((raw, index) => {
    const normalized: JsonObj = {};
    const dropped: string[] = [];
    const coerced: string[] = [];
    for (const [k, val] of Object.entries(raw)) {
      const col = colByName.get(k);
      if (!col) {
        dropped.push(k);
        continue;
      }
      const cv = coerce(val, col);
      normalized[k] = cv.value;
      if (cv.coerced) coerced.push(k);
    }
    const filled: string[] = [];
    for (const [k, val] of Object.entries(defaults)) {
      if (!colByName.has(k)) continue;
      if (isEmptyish(normalized[k])) {
        normalized[k] = val;
        filled.push(k);
      }
    }
    const missingRequired = required.filter(
      (c) => normalized[c] === undefined || normalized[c] === null,
    );
    return {
      index,
      valid: Object.keys(normalized).length > 0,
      filled: filled.sort(),
      coerced: coerced.sort(),
      dropped: dropped.sort(),
      missingRequired: missingRequired.sort(),
      normalized,
    };
  });
}

// --- Şablon + prompt üretimi (kopyalanıp otomasyona/AI'ya verilir) ---
function placeholder(c: ColumnMeta): unknown {
  if (isBool(c)) return false;
  if (isNumeric(c)) return 0;
  if (isArray(c)) return [];
  if (isJSON(c)) return {};
  return "";
}

export function template(columns: ColumnMeta[], defaults: JsonObj): unknown[] {
  const obj: JsonObj = {};
  for (const c of columns) {
    if (AUTO_GEN.has(c.name)) continue;
    obj[c.name] = c.name in defaults ? defaults[c.name] : placeholder(c);
  }
  return [obj];
}

export function buildPrompt(
  table: string,
  columns: ColumnMeta[],
  defaults: JsonObj,
  count: number,
  extra: string,
): string {
  const writable = columns.filter((c) => !AUTO_GEN.has(c.name));
  const required = writable.filter((c) => !c.nullable && !c.isPrimaryKey).map((c) => c.name);
  const schemaLines = writable
    .map((c) => `- ${c.name}: ${c.type}${c.nullable ? "" : " (zorunlu)"}`)
    .join("\n");
  const fixed =
    Object.keys(defaults).length === 0
      ? ""
      : "\nSABİT DEĞERLER (aynen kullan):\n" +
        Object.entries(defaults)
          .map(([k, v]) => `- ${k} = ${JSON.stringify(v)}`)
          .join("\n");
  const tmpl = JSON.stringify(template(columns, defaults), null, 2);
  return `Aşağıdaki şemaya UYGUN, tıbbi olarak doğru ${count} kayıt üret.
SADECE geçerli bir JSON DİZİSİ döndür — markdown, kod bloğu, açıklama YAZMA.
Tablo: ${table}
Zorunlu alanlar: ${required.join(", ")}
${fixed}

ŞEMA (alan: tip):
${schemaLines}

ÖRNEK BİÇİM:
${tmpl}
${extra}`;
}

// --- KamuBase satır normalizasyonu (yazmadan önce) ---
function nonEmptyString(v: unknown): string | null {
  let s: string | null = null;
  if (typeof v === "string") s = v;
  else if (typeof v === "number") s = Number.isInteger(v) ? String(v) : String(v);
  else if (typeof v === "boolean") s = v ? "true" : "false";
  const t = (s ?? "").trim();
  return t === "" ? null : t;
}
function setIfMissing(row: JsonObj, key: string, value: unknown) {
  const cur = row[key];
  const missing =
    cur === undefined || cur === null || (typeof cur === "string" && cur.trim() === "");
  if (missing) row[key] = value;
}

export const KAMUBASE_IMPORT_SOURCE = "ai_admin_panel";

export function normalizeKamubaseRow(input: JsonObj): JsonObj {
  const out: JsonObj = { ...input };
  const metaIn = (
    out.metadata && typeof out.metadata === "object" && !Array.isArray(out.metadata)
      ? out.metadata
      : {}
  ) as JsonObj;

  const exam = nonEmptyString(out.exam) ?? "KPSS";
  const subject = nonEmptyString(out.subject) ?? "Genel";
  const unit = nonEmptyString(out.unit) ?? "";
  const topic = nonEmptyString(out.topic) ?? "Genel";
  const subtopic = nonEmptyString(out.subtopic) ?? nonEmptyString(metaIn.subtopic) ?? topic;
  const objective =
    nonEmptyString(out.learning_objective) ??
    nonEmptyString(metaIn.learning_objective) ??
    nonEmptyString(metaIn.kazanim) ??
    (topic ? `${topic} konusunu kavrar ve soruları doğru çözer.` : "");
  const questionType =
    nonEmptyString(out.question_type) ?? nonEmptyString(metaIn.question_type) ?? "multiple_choice";
  const cognitiveLevel =
    nonEmptyString(out.cognitive_level) ?? nonEmptyString(metaIn.cognitive_level) ?? "application";
  const source = nonEmptyString(out.source_file_name) ?? KAMUBASE_IMPORT_SOURCE;

  setIfMissing(out, "exam", exam);
  setIfMissing(out, "subject", subject);
  setIfMissing(out, "unit", unit);
  setIfMissing(out, "topic", topic);
  setIfMissing(out, "subtopic", subtopic);
  setIfMissing(out, "learning_objective", objective);
  setIfMissing(out, "question_type", questionType);
  setIfMissing(out, "cognitive_level", cognitiveLevel);
  setIfMissing(out, "is_active", true);
  setIfMissing(out, "is_user_generated", false);
  setIfMissing(out, "source_file_name", source);

  const tags = new Set<string>();
  if (Array.isArray(out.tags))
    for (const t of out.tags as unknown[]) {
      const s = nonEmptyString(t);
      if (s) tags.add(s);
    }
  tags.add("app:kamubase");
  tags.add("exam:kpss");
  out.tags = Array.from(tags);

  const metadata: JsonObj = { ...metaIn };
  setIfMissing(metadata, "exam", exam);
  setIfMissing(metadata, "unit", unit);
  setIfMissing(metadata, "subtopic", subtopic);
  setIfMissing(metadata, "kazanim", objective);
  setIfMissing(metadata, "learning_objective", objective);
  setIfMissing(metadata, "question_type", questionType);
  setIfMissing(metadata, "cognitive_level", cognitiveLevel);
  setIfMissing(metadata, "source", source);
  setIfMissing(metadata, "canonical_path", [subject, unit, topic].filter(Boolean).join(" / "));
  const topicNodeId = nonEmptyString(out.topic_node_id);
  if (topicNodeId) setIfMissing(metadata, "topic_node_id", topicNodeId);
  out.metadata = metadata;

  return out;
}
