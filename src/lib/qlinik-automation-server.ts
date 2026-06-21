import { createServerFn } from "@tanstack/react-start";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";
import { adminRest } from "@/lib/admin-rest-server";

type CheckTone = "ok" | "warning" | "error";

export type QlinikAutomationCheck = {
  id: string;
  label: string;
  detail: string;
  tone: CheckTone;
  ms?: number;
  count?: number;
  status?: number;
  error?: string;
};

export type QlinikAutomationStatus = {
  generatedAt: string;
  readiness: CheckTone;
  summary: {
    totalChecks: number;
    ok: number;
    warning: number;
    error: number;
  };
  endpoints: QlinikAutomationCheck[];
  data: QlinikAutomationCheck[];
  env: QlinikAutomationCheck[];
  setup: {
    supabaseUrl: string;
    edgeFunctionUrl: string;
    qlinikAppUrl: string;
    adminPanelUrl: string;
    pdfEndpoint: string;
    dartDefines: string[];
    dockerBuildArgs: string[];
    qlinikRuntimeFlow: string[];
  };
};

const QLINIK_APP_URL = "https://qlinik.medasi.com.tr";
const FALLBACK_ADMIN_PANEL_URL = "https://admin.medasi.com.tr";

function envValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function elapsed(startedAt: number) {
  return Math.round(performance.now() - startedAt);
}

function shortError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 220) : "Bilinmeyen hata";
}

function envCheck({
  key,
  label,
  value,
  required = true,
  detail,
}: {
  key: string;
  label: string;
  value: string;
  required?: boolean;
  detail: string;
}): QlinikAutomationCheck {
  const present = value.trim().length > 0;
  return {
    id: key,
    label,
    detail: present ? detail : `${key} eksik.`,
    tone: present ? "ok" : required ? "error" : "warning",
  };
}

async function httpCheck(
  id: string,
  label: string,
  url: string,
  init?: RequestInit,
): Promise<QlinikAutomationCheck> {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      ...init,
      headers: {
        accept: "application/json,text/html;q=0.9,*/*;q=0.8",
        ...(init?.headers ?? {}),
      },
    });
    return {
      id,
      label,
      detail: url,
      tone: response.ok ? "ok" : "error",
      status: response.status,
      ms: elapsed(startedAt),
      error: response.ok ? undefined : response.statusText,
    };
  } catch (error) {
    return {
      id,
      label,
      detail: url,
      tone: "error",
      ms: elapsed(startedAt),
      error: shortError(error),
    };
  }
}

async function tableCountCheck(
  id: string,
  label: string,
  schema: string,
  table: string,
  query = "",
): Promise<QlinikAutomationCheck> {
  const startedAt = performance.now();
  const params = new URLSearchParams(query);
  if (!params.has("select")) params.set("select", "id");
  params.set("limit", "1");

  try {
    const result = await adminRest({
      schema,
      path: table,
      method: "GET",
      query: params.toString(),
    });
    return {
      id,
      label,
      detail: `${schema}.${table}`,
      tone: "ok",
      count: result.count ?? (Array.isArray(result.data) ? result.data.length : undefined),
      ms: elapsed(startedAt),
    };
  } catch (error) {
    return {
      id,
      label,
      detail: `${schema}.${table}`,
      tone: "error",
      ms: elapsed(startedAt),
      error: shortError(error),
    };
  }
}

function summarize(checks: QlinikAutomationCheck[]) {
  const ok = checks.filter((check) => check.tone === "ok").length;
  const warning = checks.filter((check) => check.tone === "warning").length;
  const error = checks.filter((check) => check.tone === "error").length;
  return {
    totalChecks: checks.length,
    ok,
    warning,
    error,
  };
}

export async function getQlinikAutomationStatus(): Promise<QlinikAutomationStatus> {
  const supabaseUrl = envValue("SUPABASE_URL", "VITE_SUPABASE_URL").replace(/\/$/, "");
  const anonKey = envValue("SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_PUBLISHABLE_KEY");
  const serviceKey = envValue("SUPABASE_SERVICE_ROLE_KEY");
  const adminPanelUrl =
    envValue("ADMIN_PANEL_URL", "VITE_ADMIN_PANEL_URL", "SITE_URL") || FALLBACK_ADMIN_PANEL_URL;
  const recallBaseUrl =
    envValue("RECALL_BASE_URL", "VITE_RECALL_BASE_URL") || "https://recall.medasi.com.tr";

  const edgeFunctionUrl = supabaseUrl ? `${supabaseUrl}/functions/v1/qlinik` : "";
  const pdfEndpoint = `${adminPanelUrl.replace(/\/$/, "")}/api/qlinik-pdf`;

  const env = [
    envCheck({
      key: "SUPABASE_URL",
      label: "Ortak Supabase URL",
      value: supabaseUrl,
      detail: "Admin panel ve Qlinik aynı Supabase API adresine bağlı.",
    }),
    envCheck({
      key: "SUPABASE_PUBLISHABLE_KEY",
      label: "Qlinik public anon key",
      value: anonKey,
      detail: "Flutter web/mobile build için public anon key hazır.",
    }),
    envCheck({
      key: "SUPABASE_SERVICE_ROLE_KEY",
      label: "Admin service-role gateway",
      value: serviceKey,
      detail: "Admin panel service-role ile tüm yönetim işlemlerini yapabilir.",
    }),
    envCheck({
      key: "QLINIK_PDF_API_KEY",
      label: "Qlinik PDF shared key",
      value: envValue("QLINIK_PDF_API_KEY"),
      required: false,
      detail: "Harici Qlinik PDF endpoint'i anahtarlı erişime açık.",
    }),
    envCheck({
      key: "PDF_RENDERER_URL",
      label: "PDF renderer",
      value: envValue("PDF_RENDERER_URL"),
      required: false,
      detail: "PDF servisi gerçek PDF döndürebilir; yoksa HTML yazdırma yedeği kullanılır.",
    }),
  ];

  const endpoints = await Promise.all([
    httpCheck("qlinik-app", "Qlinik uygulaması", QLINIK_APP_URL),
    supabaseUrl
      ? httpCheck("supabase-auth", "Supabase Auth", `${supabaseUrl}/auth/v1/health`)
      : Promise.resolve({
          id: "supabase-auth",
          label: "Supabase Auth",
          detail: "SUPABASE_URL eksik.",
          tone: "error" as const,
        }),
    edgeFunctionUrl && anonKey
      ? httpCheck("qlinik-edge", "Qlinik Edge Function", edgeFunctionUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            apikey: anonKey,
          },
          body: JSON.stringify({
            action: "registration_preflight",
            email: "admin-panel-healthcheck@medasi.invalid",
          }),
        })
      : Promise.resolve({
          id: "qlinik-edge",
          label: "Qlinik Edge Function",
          detail: "SUPABASE_URL veya SUPABASE_PUBLISHABLE_KEY eksik.",
          tone: "error" as const,
        }),
  ]);

  const data = await Promise.all([
    tableCountCheck("profiles", "Kullanıcı profilleri", "public", "profiles"),
    tableCountCheck(
      "questions-active",
      "Canlı Qlinik soruları",
      "public",
      "questions",
      "is_active=eq.true",
    ),
    tableCountCheck("taxonomy", "Qlinik taksonomi", "public", "qlinik_taxonomy"),
    tableCountCheck("attempts", "Soru çözüm kayıtları", "public", "question_attempts"),
    tableCountCheck("wallet", "Cüzdan hakları", "public", "wallet_entitlements"),
    tableCountCheck("store", "Mağaza ürünleri", "public", "store_products"),
    tableCountCheck("notifications", "Bildirim kutusu", "public", "notification_messages"),
    tableCountCheck("support", "Destek talepleri", "public", "support_tickets"),
  ]);

  const allChecks = [...env, ...endpoints, ...data];
  const summary = summarize(allChecks);
  const readiness: CheckTone = summary.error > 0 ? "error" : summary.warning > 0 ? "warning" : "ok";

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    summary,
    endpoints,
    data,
    env,
    setup: {
      supabaseUrl,
      edgeFunctionUrl,
      qlinikAppUrl: QLINIK_APP_URL,
      adminPanelUrl,
      pdfEndpoint,
      dartDefines: [
        `--dart-define=SUPABASE_URL=${supabaseUrl || "<SUPABASE_URL>"}`,
        `--dart-define=SUPABASE_ANON_KEY=${anonKey || "<SUPABASE_PUBLISHABLE_KEY>"}`,
        "--dart-define=MOBILE_SUPABASE_URL=https://medasi.com.tr",
        `--dart-define=RECALL_BASE_URL=${recallBaseUrl}`,
        "--dart-define=ECOSYSTEM_SETUP_URL=https://medasi.com.tr/kurulum",
      ],
      dockerBuildArgs: [
        `SUPABASE_URL=${supabaseUrl || "<SUPABASE_URL>"}`,
        `SUPABASE_ANON_KEY=${anonKey || "<SUPABASE_PUBLISHABLE_KEY>"}`,
        "ENABLE_NATIVE_PURCHASES=true",
      ],
      qlinikRuntimeFlow: [
        "Qlinik uygulaması Supabase Auth ile oturum açar.",
        "Tüm ürün içi işlemler /functions/v1/qlinik action router üzerinden akar.",
        "Admin panel aynı Supabase verisini service-role gateway ile yönetir.",
        "PDF çıktıları /api/qlinik-pdf endpoint'i üzerinden anahtarlı üretilebilir.",
      ],
    },
  };
}

export const qlinikAutomationStatusFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .handler(() => getQlinikAutomationStatus());
