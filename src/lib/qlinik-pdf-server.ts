import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { adminRest } from "@/lib/admin-rest-server";
import {
  buildQlinikQuestionHtml,
  type Discipline,
  type QlinikDocumentMeta,
  type QlinikQuestion,
} from "@/lib/qlinik-pdf-template";

// ---------------------------------------------------------------------------
// Qlinik soru bankası PDF üretim motoru (sunucu tarafı, service_role)
//
// Akış: Qlinik (veya admin panel) bir filtre/istek gönderir → bu modül
// public.questions tablosundan service_role ile soruları çeker → tipli
// QlinikQuestion'a eşler → qlinik-pdf-template ile A4 HTML belge üretir →
// pluggable renderer ile PDF baytına (veya HTML'e) dönüştürür ve kullanıcıya
// gönderilmek üzere döndürür.
//
// PDF render bağımlılığı kasıtlı olarak DIŞARI alınmıştır: proje "ağır
// bağımlılık yok" felsefesini korur. Gerçek PDF baytı için ortam değişkeni
// PDF_RENDERER_URL (Gotenberg uyumlu bir HTML→PDF servisi) ayarlanır; yoksa
// motor print-hazır HTML döndürür (tarayıcı tarafı yazdırma → PDF).
// ---------------------------------------------------------------------------

const DISCIPLINES: Discipline[] = ["tip", "dis", "hemsirelik", "ftr", "veteriner", "saglik"];

export type QlinikPdfRequest = {
  /** Şablon disiplini; metadata->>discipline filtresini de belirler. */
  discipline?: Discipline;
  /** Belirli soru ID'leri (verilirse subject/topic/limit yok sayılır). */
  ids?: string[];
  /** subject (Branş/Ders) ilike filtresi. */
  subject?: string;
  /** topic (Konu) ilike filtresi. */
  topic?: string;
  /** difficulty eşitlik filtresi (easy|medium|hard). */
  difficulty?: string;
  /** Maksimum soru adedi (varsayılan 50, tavan 300). */
  limit?: number;
  /** Yalnızca aktif sorular (varsayılan true). */
  onlyActive?: boolean;
  /** Cevap anahtarı + açıklamalar dahil mi (varsayılan true). */
  withAnswers?: boolean;
  /** Kişiye özel belge meta verisi (kullanıcı, belge ID, sınav, filigran). */
  meta?: Omit<QlinikDocumentMeta, "discipline" | "withAnswers">;
  /** Çıktı biçimi: "pdf" (renderer varsa) veya "html". Varsayılan "pdf". */
  format?: "pdf" | "html";
};

export type QlinikPdfResult = {
  /** "pdf" → base64 PDF; "html" → ham HTML. */
  format: "pdf" | "html";
  filename: string;
  /** format=html iken dolu. */
  html?: string;
  /** format=pdf iken dolu (base64). */
  pdfBase64?: string;
  questionCount: number;
};

const QUESTION_SELECT =
  "id,subject,topic,difficulty,text,options,correct_index,explanation,option_rationales,tags,metadata,is_active,created_at";

function clampLimit(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 50;
  return Math.min(300, Math.floor(n));
}

function normalizeRequest(raw: unknown): QlinikPdfRequest {
  const input = (raw ?? {}) as Record<string, unknown>;
  const discipline = DISCIPLINES.includes(input.discipline as Discipline)
    ? (input.discipline as Discipline)
    : undefined;
  const ids = Array.isArray(input.ids)
    ? input.ids.map((v) => String(v)).filter(Boolean)
    : undefined;
  const metaInput = (input.meta ?? {}) as Record<string, unknown>;
  return {
    discipline,
    ids,
    subject: typeof input.subject === "string" ? input.subject : undefined,
    topic: typeof input.topic === "string" ? input.topic : undefined,
    difficulty: typeof input.difficulty === "string" ? input.difficulty : undefined,
    limit: clampLimit(input.limit),
    onlyActive: input.onlyActive !== false,
    withAnswers: input.withAnswers !== false,
    format: input.format === "html" ? "html" : "pdf",
    meta: {
      branch: str(metaInput.branch),
      topic: str(metaInput.topic),
      userName: str(metaInput.userName),
      documentId: str(metaInput.documentId),
      exam: str(metaInput.exam),
      dateLabel: str(metaInput.dateLabel),
      titleOverride: str(metaInput.titleOverride),
      noWatermark: metaInput.noWatermark === true,
    },
  };
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

/** PostgREST sorgu parçalarını filtrelerden kur. */
function buildQuery(req: QlinikPdfRequest): string {
  const parts: string[] = ["order=created_at.desc"];
  if (req.ids && req.ids.length) {
    parts.push(`id=in.(${req.ids.join(",")})`);
  } else {
    if (req.onlyActive) parts.push("is_active=eq.true");
    if (req.discipline) parts.push(`metadata->>discipline=eq.${req.discipline}`);
    if (req.subject?.trim())
      parts.push(`subject=ilike.*${encodeURIComponent(req.subject.trim())}*`);
    if (req.topic?.trim()) parts.push(`topic=ilike.*${encodeURIComponent(req.topic.trim())}*`);
    if (req.difficulty?.trim())
      parts.push(`difficulty=eq.${encodeURIComponent(req.difficulty.trim())}`);
    parts.push(`limit=${req.limit ?? 50}`);
  }
  parts.push(`select=${QUESTION_SELECT}`);
  return parts.join("&");
}

function rowToQuestion(row: Record<string, unknown>): QlinikQuestion {
  return {
    id: row.id == null ? undefined : String(row.id),
    subject: (row.subject as string | null) ?? null,
    topic: (row.topic as string | null) ?? null,
    difficulty: (row.difficulty as string | number | null) ?? null,
    text: (row.text as string | null) ?? null,
    options: row.options,
    correct_index: row.correct_index == null ? null : Number(row.correct_index),
    explanation: (row.explanation as string | null) ?? null,
    option_rationales: row.option_rationales,
    tags: row.tags,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  };
}

/**
 * İsteği çözer, soruları service_role ile çeker ve A4 HTML belgeyi kurar.
 * (Render bağımsız; hem serverFn hem HTTP endpoint bunu kullanır.)
 */
export async function buildQlinikQuestionDocument(raw: unknown): Promise<{
  html: string;
  meta: QlinikDocumentMeta;
  filename: string;
  questionCount: number;
  format: "pdf" | "html";
}> {
  const req = normalizeRequest(raw);
  const { data } = await adminRest({
    schema: "public",
    path: "questions",
    method: "GET",
    query: buildQuery(req),
  });
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  const questions = rows.map(rowToQuestion);

  const meta: QlinikDocumentMeta = {
    ...req.meta,
    discipline: req.discipline,
    withAnswers: req.withAnswers,
  };

  const html = buildQlinikQuestionHtml(questions, meta);
  const stamp = new Date().toISOString().slice(0, 10);
  const slug = (req.discipline ?? "qlinik").replace(/[^a-z0-9]/gi, "");
  const filename = `qlinik-${slug}-soru-bankasi-${stamp}`;

  return { html, meta, filename, questionCount: questions.length, format: req.format ?? "pdf" };
}

/**
 * HTML → PDF render. Ortamda PDF_RENDERER_URL (Gotenberg `/forms/chromium/
 * convert/html` uyumlu) varsa gerçek PDF baytı döndürür; yoksa null (HTML
 * fallback'i çağıran katmana bırakılır).
 */
export async function renderHtmlToPdf(html: string): Promise<ArrayBuffer | null> {
  const rendererUrl = process.env.PDF_RENDERER_URL;
  if (!rendererUrl) return null;

  const form = new FormData();
  // Gotenberg index.html bekler; tek dosyalık dönüşüm.
  form.append("files", new Blob([html], { type: "text/html" }), "index.html");
  form.append("paperWidth", "8.27");
  form.append("paperHeight", "11.69");
  form.append("marginTop", "0");
  form.append("marginBottom", "0");
  form.append("marginLeft", "0");
  form.append("marginRight", "0");
  form.append("printBackground", "true");

  const headers: Record<string, string> = {};
  if (process.env.PDF_RENDERER_TOKEN) {
    headers.Authorization = `Bearer ${process.env.PDF_RENDERER_TOKEN}`;
  }

  const res = await fetch(rendererUrl, { method: "POST", body: form, headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PDF renderer ${res.status}: ${detail.slice(0, 200)}`);
  }
  return res.arrayBuffer();
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * Tam üretim: belge + (mümkünse) PDF render. Admin panelinin serverFn'i ve
 * HTTP endpoint bunu paylaşır.
 */
export async function generateQlinikPdf(raw: unknown): Promise<QlinikPdfResult> {
  const doc = await buildQlinikQuestionDocument(raw);

  if (doc.format === "html") {
    return {
      format: "html",
      filename: `${doc.filename}.html`,
      html: doc.html,
      questionCount: doc.questionCount,
    };
  }

  const pdf = await renderHtmlToPdf(doc.html);
  if (!pdf) {
    // Renderer yoksa HTML'e düş (çağıran taraf tarayıcıda yazdırabilir).
    return {
      format: "html",
      filename: `${doc.filename}.html`,
      html: doc.html,
      questionCount: doc.questionCount,
    };
  }

  return {
    format: "pdf",
    filename: `${doc.filename}.pdf`,
    pdfBase64: toBase64(pdf),
    questionCount: doc.questionCount,
  };
}

/** Admin panel server function — requireAdmin korumalı. */
export const qlinikPdfFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator((d: unknown) => normalizeRequest(d))
  .handler(async ({ data }) => generateQlinikPdf(data));
