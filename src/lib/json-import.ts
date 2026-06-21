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

export type QlinikDiscipline = "tip" | "dis" | "hemsirelik" | "ftr" | "veteriner";
export type QuestionImportTarget =
  | { bank: "qlinik"; discipline?: QlinikDiscipline }
  | { bank: "kamubase" };

export type QuestionImportLocks = {
  subject?: string;
  unit?: string;
  topic?: string;
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

export function validateQuestionImport(
  rows: JsonObj[],
  columns: ColumnMeta[],
  defaults: JsonObj,
  target: QuestionImportTarget,
  locks: QuestionImportLocks,
): ImportRowResult[] {
  return rows.map((raw, index) => {
    const { row, issues } = normalizeQuestionImportRow(raw, target, locks);
    const [result] = validate([row], columns, defaults);
    const missingRequired = Array.from(new Set([...result.missingRequired, ...issues])).sort();
    return {
      ...result,
      index,
      valid: result.valid && missingRequired.length === 0,
      missingRequired,
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

export function questionImportTemplate(
  target: QuestionImportTarget,
  locks: QuestionImportLocks = {},
): unknown[] {
  if (target.bank === "kamubase") {
    return [
      {
        subject: locks.subject ?? "",
        unit: locks.unit ?? "",
        topic: locks.topic ?? "",
        subtopic: locks.topic ?? "",
        learning_objective: "",
        difficulty: "medium",
        text: "",
        options: ["", "", "", "", ""],
        correct_index: 0,
        explanation: "",
        option_rationales: ["", "", "", "", ""],
      },
    ];
  }

  const discipline = target.discipline;
  return [
    {
      subject: locks.subject ?? "",
      topic: locks.topic ?? "",
      difficulty: "medium",
      text: "",
      options: ["", "", "", "", ""],
      correct_index: 0,
      explanation: "",
      option_rationales: ["", "", "", "", ""],
      tags: [],
      metadata: {
        subtopic: "",
        question_type: "",
        cognitive_level: "application",
        confidence: "high",
        ...(discipline ? { discipline } : {}),
      },
    },
  ];
}

export function questionImportPrompt(
  target: QuestionImportTarget,
  count: number,
  locks: QuestionImportLocks = {},
): string {
  const DISCIPLINE_TITLES: Record<string, string> = {
    tip: "Qlinik Tıp",
    dis: "Qlinik Diş",
    hemsirelik: "Qlinik Hemşirelik",
    ftr: "Qlinik FTR",
    veteriner: "Qlinik Veterinerlik",
  };
  const bankTitle =
    target.bank === "kamubase"
      ? "KamuBase"
      : (DISCIPLINE_TITLES[target.discipline ?? "tip"] ?? "Qlinik Tıp");
  const required =
    target.bank === "kamubase"
      ? "subject, unit, topic, subtopic, learning_objective, difficulty(easy|medium|hard), text, options(5 string), correct_index(0-4), explanation, option_rationales(5 dolu string)"
      : "subject, topic, difficulty(easy|medium|hard), text, options(5 string), correct_index(0-4), explanation, option_rationales(5 dolu string), tags, metadata.subtopic";
  const scope = [
    locks.subject ? `Ders (subject HER kayıtta birebir bu olacak): "${locks.subject}"` : "",
    locks.unit && target.bank === "kamubase"
      ? `Ünite (unit HER kayıtta birebir bu olacak): "${locks.unit}"`
      : "",
    locks.topic ? `Konu (topic HER kayıtta birebir bu olacak): "${locks.topic}"` : "",
  ]
    .filter(Boolean)
    .join("\n");
  return `${bankTitle} soru bankası için ${count} çoktan seçmeli soru üret ve AŞAĞIDAKİ JSON FORMATINI birebir doldur.
SADECE geçerli bir JSON DİZİSİ döndür — markdown/kod bloğu/açıklama yazma. Türkçe üret.
ZORUNLU ALANLAR: ${required}
Tek doğru cevap; correct_index doğru şıkkın 0 tabanlı indeksi.
${scope ? `${scope}\n` : ""}Sorular import sonrası TASLAK/PASİF olarak yazılacak; yayınlama ayrı onay adımıdır.

FORMAT:
${JSON.stringify(questionImportTemplate(target, locks), null, 2)}`;
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

function stringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((item) => nonEmptyString(item)).filter((item): item is string => !!item);
}

function objectValue(v: unknown): JsonObj {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as JsonObj) : {};
}

function metadataString(row: JsonObj, key: string): string | null {
  return nonEmptyString(objectValue(row.metadata)[key]);
}

function parseCorrectIndex(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeQuestionImportRow(
  input: JsonObj,
  target: QuestionImportTarget,
  locks: QuestionImportLocks,
): { row: JsonObj; issues: string[] } {
  const issues: string[] = [];
  const subject = nonEmptyString(locks.subject) ?? nonEmptyString(input.subject) ?? "";
  const unit = nonEmptyString(locks.unit) ?? nonEmptyString(input.unit) ?? "";
  const topic = nonEmptyString(locks.topic) ?? nonEmptyString(input.topic) ?? "";
  const subtopic =
    nonEmptyString(input.subtopic) ??
    metadataString(input, "subtopic") ??
    (target.bank === "kamubase" ? topic : "");
  const learningObjective =
    nonEmptyString(input.learning_objective) ??
    metadataString(input, "learning_objective") ??
    metadataString(input, "kazanim") ??
    "";
  const difficulty = ["easy", "medium", "hard"].includes(
    (nonEmptyString(input.difficulty) ?? "").toLowerCase(),
  )
    ? (nonEmptyString(input.difficulty) ?? "medium").toLowerCase()
    : "medium";
  const text = nonEmptyString(input.text) ?? "";
  const options = stringArray(input.options);
  const correctIndex = parseCorrectIndex(input.correct_index);
  const explanation = nonEmptyString(input.explanation) ?? "";
  const rationales = stringArray(input.option_rationales);

  if (!subject) issues.push("ders (subject) boş");
  if (!topic) issues.push("konu (topic) boş");
  if (!text) issues.push("soru metni boş");
  if (options.length !== 5) issues.push(`şık sayısı 5 olmalı (${options.length})`);
  if (correctIndex === null) issues.push("correct_index eksik");
  else if (correctIndex < 0 || correctIndex >= 5 || correctIndex >= Math.max(options.length, 1)) {
    issues.push(`correct_index aralık dışı (${correctIndex})`);
  }
  if (!explanation) issues.push("açıklama boş");
  if (rationales.length !== 5 || rationales.some((item) => !item.trim())) {
    issues.push("şık gerekçeleri (option_rationales) 5 dolu metin olmalı");
  }

  if (target.bank === "kamubase") {
    if (!unit) issues.push("ünite (unit) boş");
    if (!learningObjective) issues.push("kazanım (learning_objective) boş");
    return {
      row: normalizeKamubaseRow({
        ...input,
        exam: "KPSS",
        subject,
        unit,
        topic,
        subtopic,
        learning_objective:
          learningObjective || (topic ? `${topic} konusunu kavrar ve soruları doğru çözer.` : ""),
        difficulty,
        text,
        options,
        correct_index: correctIndex ?? 0,
        explanation,
        option_rationales: rationales,
        is_active: false,
        is_user_generated: false,
        source_file_name: nonEmptyString(input.source_file_name) ?? KAMUBASE_IMPORT_SOURCE,
      }),
      issues,
    };
  }

  const metadata: JsonObj = { ...objectValue(input.metadata) };
  setIfMissing(metadata, "subtopic", subtopic);
  setIfMissing(metadata, "question_type", nonEmptyString(metadata.question_type) ?? "");
  setIfMissing(
    metadata,
    "cognitive_level",
    nonEmptyString(metadata.cognitive_level) ?? "application",
  );
  setIfMissing(metadata, "confidence", nonEmptyString(metadata.confidence) ?? "high");
  setIfMissing(metadata, "source", "json_import");
  // Disiplin, seçilen preset tarafından ZORLA damgalanır (setIfMissing DEĞİL):
  // JSON içinde farklı bir discipline gelse bile bankayı kullanıcının seçimi belirler.
  // (4 disiplinin de kendi "Anatomi" dersi var; ayrım metadata.discipline ile yapılır.)
  if (target.discipline) metadata.discipline = target.discipline;

  // Yanlış disiplin etiketlerini temizleyip yalnızca seçilen disiplini ekle.
  const tags = new Set(stringArray(input.tags).filter((t) => !t.startsWith("discipline:")));
  tags.add("app:qlinik");
  if (target.discipline) tags.add(`discipline:${target.discipline}`);

  const row: JsonObj = {
    ...input,
    subject,
    topic,
    difficulty,
    text,
    options,
    correct_index: correctIndex ?? 0,
    explanation,
    option_rationales: rationales,
    tags: Array.from(tags),
    metadata,
    is_active: false,
    is_user_generated: false,
    source_file_id: nonEmptyString(input.source_file_id) ?? "json_import",
    source_file_name: nonEmptyString(input.source_file_name) ?? "json_import",
  };
  if (target.discipline) row.access_disciplines = [target.discipline];
  return { row, issues };
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
