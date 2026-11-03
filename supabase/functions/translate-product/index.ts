import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LANGUAGES = ["fr", "ar", "en"] as const;
type Language = (typeof LANGUAGES)[number];

// Community-hosted LibreTranslate mirrors. No paid key or account is used.
// These are independent public services; availability and rate limits can change.
const TRANSLATION_HOSTS = [
  "https://translate.mentality.rip",
  "https://translate.argosopentech.com",
  "https://translate.api.skitzen.com",
  "https://trans.zillyhuhn.com",
  "https://libretranslate.de",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function requestJson(url: string, body: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) throw new Error("translation_provider_error");
  return await response.json();
}

async function detectLanguage(text: string): Promise<string | null> {
  for (const host of TRANSLATION_HOSTS) {
    try {
      const result = await requestJson(`${host}/detect`, { q: text });
      const detected = Array.isArray(result) ? result[0]?.language : null;
      if (typeof detected === "string" && detected.length <= 12) return detected;
    } catch {
      // Try the next free mirror.
    }
  }
  return null;
}

async function translatePair(text: string, source: string, target: Language): Promise<string> {
  let lastError: unknown;
  for (const host of TRANSLATION_HOSTS) {
    try {
      const result = await requestJson(`${host}/translate`, {
        q: text,
        source,
        target,
        format: "text",
      });
      if (typeof result?.translatedText === "string" && result.translatedText.trim()) {
        return result.translatedText;
      }
      throw new Error("empty_translation");
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("translation_unavailable");
}

async function translateText(text: string, source: string | null, target: Language) {
  if (source === target) return text;
  if (source) {
    try {
      return await translatePair(text, source, target);
    } catch {
      // Some open models do not include every language pair; pivot through English.
      if (source !== "en" && target !== "en") {
        const english = await translatePair(text, source, "en");
        return await translatePair(english, "en", target);
      }
    }
  }

  // Auto-detection fallback for content written in a language outside the UI's three languages.
  let lastError: unknown;
  for (const host of TRANSLATION_HOSTS) {
    try {
      const result = await requestJson(`${host}/translate`, {
        q: text,
        source: "auto",
        target,
        format: "text",
      });
      if (typeof result?.translatedText === "string" && result.translatedText.trim()) {
        return result.translatedText;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("translation_unavailable");
}

async function translateField(text: string, source: string | null) {
  const output: Record<Language, string> = { fr: text, ar: text, en: text };
  const translated = await Promise.all(
    LANGUAGES.filter((target) => source !== target).map(
      async (target) => [target, await translateText(text, source, target)] as const,
    ),
  );
  for (const [target, value] of translated) output[target] = value;
  return output;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return jsonResponse({ error: "server_not_configured" }, 500);

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { name?: unknown; description?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 180 || !description || description.length > 5000) {
    return jsonResponse({ error: "invalid_product_content" }, 400);
  }

  const source = await detectLanguage(`${name}\n\n${description}`);
  try {
    const [nameTranslations, descriptionTranslations] = await Promise.all([
      translateField(name, source),
      translateField(description, source),
    ]);
    return jsonResponse({ nameTranslations, descriptionTranslations });
  } catch {
    return jsonResponse({ error: "translation_unavailable" }, 503);
  }
});
