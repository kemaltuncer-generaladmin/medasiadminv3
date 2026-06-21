import { createServerFn } from "@tanstack/react-start";
import crypto from "node:crypto";
import { requireAdmin } from "@/integrations/supabase/admin-middleware";

// ---------------------------------------------------------------------------
// AI üretim sunucu geçidi (Vertex Gemini + OpenAI).
//
// v2'de servis hesabı anahtarı uygulamaya gömülüydü; web'de bu bir sunucu
// secret'ıdır (GEMINI_SERVICE_ACCOUNT_JSON veya base64 sürümü). Vertex erişim token'ı, Node
// crypto ile RS256 imzalı JWT'den üretilir (v2 AIService'in birebir karşılığı,
// Swift'teki elle ASN.1 ayrıştırma yerine PEM doğrudan kullanılır).
// ---------------------------------------------------------------------------

export const AI_MODELS = ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-3.1-pro-preview"];
export const AI_DEFAULT_MODEL = "gemini-2.5-flash";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri: string;
  project_id: string;
};

function serviceAccount(): ServiceAccount {
  const raw = process.env.GEMINI_SERVICE_ACCOUNT_JSON_BASE64
    ? Buffer.from(process.env.GEMINI_SERVICE_ACCOUNT_JSON_BASE64, "base64").toString("utf8")
    : process.env.GEMINI_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GEMINI_SERVICE_ACCOUNT_JSON veya GEMINI_SERVICE_ACCOUNT_JSON_BASE64 sunucu ortamında tanımlı değil.",
    );
  }
  try {
    return JSON.parse(raw) as ServiceAccount;
  } catch {
    throw new Error("GEMINI_SERVICE_ACCOUNT_JSON geçerli JSON değil.");
  }
}

let tokenCache: { token: string; exp: number } | undefined;

async function vertexAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.exp > Date.now() + 60_000) return tokenCache.token;
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/cloud-platform",
      aud: sa.token_uri,
      iat: now,
      exp: now + 3600,
    }),
  ).toString("base64url");
  const unsigned = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(unsigned)
    .sign(sa.private_key)
    .toString("base64url");
  const assertion = `${unsigned}.${signature}`;

  const res = await fetch(sa.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`GoogleOAuth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new Error("Vertex erişim token'ı alınamadı.");
  tokenCache = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

function thinkingConfig(model: string) {
  if (model.startsWith("gemini-3")) return { thinkingLevel: "LOW" };
  if (model.startsWith("gemini-2.5-flash")) return { thinkingBudget: 0 };
  return {};
}

async function vertexGenerate(
  system: string,
  user: string,
  model: string,
  temperature: number,
): Promise<string> {
  const token = await vertexAccessToken();
  const project = process.env.VERTEX_PROJECT_ID ?? serviceAccount().project_id;
  const location = process.env.VERTEX_LOCATION ?? "us-central1";
  const host =
    location === "global" ? "aiplatform.googleapis.com" : `${location}-aiplatform.googleapis.com`;
  const endpoint = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      systemInstruction: { role: "system", parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature,
        responseMimeType: "application/json",
        maxOutputTokens: 65535,
        thinkingConfig: thinkingConfig(model),
      },
      labels: { app: "medasi-adminpanelv3", source: "ai-studio" },
    }),
  });
  if (!res.ok) throw new Error(`VertexAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const obj = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = obj.candidates?.[0]?.content?.parts?.map((p) => p.text).find(Boolean);
  if (!text) throw new Error("AI yanıtı çözümlenemedi.");
  return text;
}

async function openaiGenerate(
  system: string,
  user: string,
  model: string,
  temperature: number,
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY sunucu ortamında tanımlı değil.");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey.trim()}` },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const obj = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const text = obj.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenAI yanıtı çözümlenemedi.");
  return text;
}

// Server-only generation helper reused by the PratiCase pipeline.
export async function aiGenerate(
  provider: "vertex" | "openai",
  system: string,
  user: string,
  model: string,
  temperature: number,
): Promise<string> {
  return provider === "openai"
    ? openaiGenerate(system, user, model, temperature)
    : vertexGenerate(system, user, model, temperature);
}

type AiGenerateInput = {
  provider: "vertex" | "openai";
  system: string;
  user: string;
  model: string;
  temperature: number;
};

function validateAiInput(raw: unknown): AiGenerateInput {
  const input = (raw ?? {}) as Record<string, unknown>;
  const provider = input.provider === "openai" ? "openai" : "vertex";
  if (typeof input.system !== "string" || typeof input.user !== "string")
    throw new Error("system/user gerekli.");
  return {
    provider,
    system: input.system,
    user: input.user,
    model: typeof input.model === "string" && input.model ? input.model : AI_DEFAULT_MODEL,
    temperature:
      typeof input.temperature === "number" ? Math.min(1, Math.max(0, input.temperature)) : 0.3,
  };
}

export const aiGenerateFn = createServerFn({ method: "POST" })
  .middleware([requireAdmin])
  .validator(validateAiInput)
  .handler(async ({ data }): Promise<{ text: string }> => {
    const text = await aiGenerate(
      data.provider,
      data.system,
      data.user,
      data.model,
      data.temperature,
    );
    return { text };
  });
