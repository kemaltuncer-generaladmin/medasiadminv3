import { moduleSystemPrompt, type ModuleKey } from "@/lib/praticase-ai-server";

// Düzenlenebilir AI prompt kütüphanesi — v2 PromptLibrary'nin web karşılığı.
// Override'lar localStorage'da saklanır (DB şemasına dokunmaz). Üretimde override
// varsa o, yoksa derlemeye gömülü varsayılan kullanılır.

const PROMPT_KEY = (key: ModuleKey) => `prompt_override_${key}`;
const TEMP_KEY = "ai_temperature";

export function defaultPrompt(key: ModuleKey): string {
  return moduleSystemPrompt(key);
}

export function effectivePrompt(key: ModuleKey): string {
  if (typeof window === "undefined") return defaultPrompt(key);
  const override = window.localStorage.getItem(PROMPT_KEY(key));
  return override && override.trim() ? override : defaultPrompt(key);
}

export function hasOverride(key: ModuleKey): boolean {
  if (typeof window === "undefined") return false;
  const v = window.localStorage.getItem(PROMPT_KEY(key));
  return !!v && v.trim() !== "" && v.trim() !== defaultPrompt(key).trim();
}

export function setOverride(key: ModuleKey, text: string) {
  if (typeof window === "undefined") return;
  const trimmed = text.trim();
  if (trimmed && trimmed !== defaultPrompt(key).trim())
    window.localStorage.setItem(PROMPT_KEY(key), trimmed);
  else window.localStorage.removeItem(PROMPT_KEY(key));
}

export function resetOverride(key: ModuleKey) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(PROMPT_KEY(key));
}

export function getTemperature(): number {
  if (typeof window === "undefined") return 0.3;
  const v = Number(window.localStorage.getItem(TEMP_KEY));
  return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.3;
}

export function setTemperature(value: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TEMP_KEY, String(Math.min(1, Math.max(0, value))));
}
