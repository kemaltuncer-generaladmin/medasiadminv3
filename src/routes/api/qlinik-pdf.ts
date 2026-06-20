import { createFileRoute } from "@tanstack/react-router";
import { buildQlinikQuestionDocument, renderHtmlToPdf } from "@/lib/qlinik-pdf-server";

// ---------------------------------------------------------------------------
// Qlinik → Admin Panel PDF servisi (harici HTTP endpoint)
//
// Qlinik uygulaması bu uca istek atar; panel sunucuda service_role ile soruları
// çeker, A4 soru bankası belgesini kurar ve hazır dosyayı (PDF veya HTML) geri
// döndürür. Kimlik doğrulama: shared API key (QLINIK_PDF_API_KEY) —
// Authorization: Bearer <key> veya x-api-key başlığı.
//
// İstek (GET query veya POST JSON):
//   discipline=tip|dis|hemsirelik|vet|saglik
//   subject, topic, difficulty, limit, onlyActive, withAnswers, format=pdf|html
//   ids=<virgülle ayrılmış>           (GET) / ids:[...]            (POST)
//   meta.* (userName, documentId, exam, branch, topic, dateLabel, noWatermark)
// ---------------------------------------------------------------------------

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.QLINIK_PDF_API_KEY;
  if (!expected) return false; // Anahtar tanımlı değilse endpoint kapalı.
  const auth = request.headers.get("authorization") ?? "";
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  const apiKey = request.headers.get("x-api-key") ?? "";
  return bearer === expected || apiKey === expected;
}

function parseMeta(params: URLSearchParams): Record<string, unknown> {
  const meta: Record<string, unknown> = {};
  for (const [k, v] of params.entries()) {
    if (k.startsWith("meta.")) meta[k.slice(5)] = v;
  }
  if ("noWatermark" in meta) meta.noWatermark = meta.noWatermark === "true";
  return meta;
}

async function readRequestPayload(request: Request): Promise<Record<string, unknown>> {
  if (request.method === "POST") {
    try {
      const body = await request.json();
      return (body ?? {}) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  const params = new URL(request.url).searchParams;
  const ids = params.get("ids");
  return {
    discipline: params.get("discipline") ?? undefined,
    subject: params.get("subject") ?? undefined,
    topic: params.get("topic") ?? undefined,
    difficulty: params.get("difficulty") ?? undefined,
    limit: params.get("limit") ?? undefined,
    onlyActive: params.get("onlyActive") !== "false",
    withAnswers: params.get("withAnswers") !== "false",
    format: params.get("format") ?? undefined,
    ids: ids
      ? ids
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined,
    meta: parseMeta(params),
  };
}

async function handle({ request }: { request: Request }): Promise<Response> {
  if (!isAuthorized(request)) {
    return unauthorized("Geçersiz veya eksik API anahtarı.");
  }

  let payload: Record<string, unknown>;
  try {
    payload = await readRequestPayload(request);
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message).slice(0, 200) }), {
      status: 400,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  try {
    const doc = await buildQlinikQuestionDocument(payload);

    if (doc.questionCount === 0) {
      return new Response(JSON.stringify({ error: "Filtreye uygun soru bulunamadı." }), {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
      });
    }

    // PDF istendi ve renderer tanımlıysa gerçek PDF baytı döndür.
    if (doc.format === "pdf") {
      const pdf = await renderHtmlToPdf(doc.html);
      if (pdf) {
        return new Response(pdf, {
          status: 200,
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `attachment; filename="${doc.filename}.pdf"`,
            "cache-control": "no-store",
            "x-question-count": String(doc.questionCount),
          },
        });
      }
    }

    // HTML fallback (renderer yok) ya da format=html.
    return new Response(doc.html, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-disposition": `inline; filename="${doc.filename}.html"`,
        "cache-control": "no-store",
        "x-question-count": String(doc.questionCount),
        "x-render-mode": doc.format === "pdf" ? "html-fallback" : "html",
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message).slice(0, 300) }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }
}

export const Route = createFileRoute("/api/qlinik-pdf")({
  server: {
    handlers: {
      GET: handle,
      POST: handle,
    },
  },
});
