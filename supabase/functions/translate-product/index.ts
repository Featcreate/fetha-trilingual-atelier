import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LANGUAGES = ["fr", "ar", "en"] as const;
type Language = (typeof LANGUAGES)[number];

function allowedOrigins(): Set<string> {
  // No implicit localhost or production-origin fallback: deployment must explicitly
  // configure the exact trusted origins, otherwise browser access fails closed.
  const configured = Deno.env.get("APP_ALLOWED_ORIGINS") ?? "";
  const values = configured
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return new Set(
    values
      .map((value) => {
        try {
          const url = new URL(value);
          const isLocalDevelopment =
            url.protocol === "http:" &&
            (url.hostname === "localhost" || url.hostname === "127.0.0.1");
          const isSecureProductionOrigin = url.protocol === "https:";
          return (isSecureProductionOrigin || isLocalDevelopment) &&
            url.origin === value.replace(/\/$/, "")
            ? url.origin
            : "";
        } catch {
          return "";
        }
      })
      .filter(Boolean),
  );
}

async function readBodyLimited(request: Request, maxBytes: number): Promise<string> {
  if (!request.body) throw new Error("invalid_json");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new Error("request_too_large");
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

function corsHeaders(origin: string | null, allowed: Set<string>) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
  if (origin && allowed.has(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function jsonResponse(
  body: unknown,
  status = 200,
  origin: string | null = null,
  allowed = allowedOrigins(),
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin, allowed), "Content-Type": "application/json" },
  });
}

function translationProviderBaseUrl(): string | null {
  const configured = Deno.env.get("TRANSLATION_API_URL")?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
      return null;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

async function requestJson(
  baseUrl: string,
  path: "detect" | "translate",
  body: Record<string, unknown>,
) {
  const apiKey = Deno.env.get("TRANSLATION_API_KEY");
  const response = await fetch(`${baseUrl}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(apiKey ? { ...body, api_key: apiKey } : body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error("translation_provider_error");
  return await response.json();
}

async function detectLanguage(text: string, baseUrl: string): Promise<string | null> {
  try {
    const result = await requestJson(baseUrl, "detect", { q: text });
    const detected = Array.isArray(result) ? result[0]?.language : null;
    return typeof detected === "string" && /^[a-zA-Z-]{2,12}$/.test(detected) ? detected : null;
  } catch {
    return null;
  }
}

async function translatePair(
  text: string,
  source: string,
  target: Language,
  baseUrl: string,
): Promise<string> {
  const result = await requestJson(baseUrl, "translate", {
    q: text,
    source,
    target,
    format: "text",
  });
  if (typeof result?.translatedText !== "string" || !result.translatedText.trim()) {
    throw new Error("empty_translation");
  }
  return result.translatedText;
}

async function translateText(
  text: string,
  source: string | null,
  target: Language,
  baseUrl: string,
) {
  if (source === target) return text;
  if (source) {
    try {
      return await translatePair(text, source, target, baseUrl);
    } catch {
      if (source !== "en" && target !== "en") {
        const english = await translatePair(text, source, "en", baseUrl);
        return await translatePair(english, "en", target, baseUrl);
      }
    }
  }
  return await translatePair(text, "auto", target, baseUrl);
}

async function translateField(text: string, source: string | null, baseUrl: string) {
  const output: Record<Language, string> = { fr: text, ar: text, en: text };
  const translated = await Promise.all(
    LANGUAGES.filter((target) => source !== target).map(
      async (target) => [target, await translateText(text, source, target, baseUrl)] as const,
    ),
  );
  for (const [target, value] of translated) output[target] = value;
  return output;
}

Deno.serve(async (request) => {
  const origin = request.headers.get("Origin");
  const allowed = allowedOrigins();

  if (origin && !allowed.has(origin)) {
    return jsonResponse({ error: "origin_not_allowed" }, 403, null, allowed);
  }
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(origin, allowed),
    });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405, origin, allowed);
  }

  const authorization = request.headers.get("Authorization");
  if (!authorization || !/^Bearer\s+\S+$/i.test(authorization)) {
    return jsonResponse({ error: "unauthorized" }, 401, origin, allowed);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const providerUrl = translationProviderBaseUrl();
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: "server_not_configured" }, 503, origin, allowed);
  }
  if (!providerUrl) {
    return jsonResponse({ error: "translation_provider_not_configured" }, 503, origin, allowed);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) {
    return jsonResponse({ error: "unauthorized" }, 401, origin, allowed);
  }

  const contentLength = Number(request.headers.get("Content-Length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 16_384) {
    return jsonResponse({ error: "request_too_large" }, 413, origin, allowed);
  }

  let body: { name?: unknown; description?: unknown };
  try {
    const rawBody = await readBodyLimited(request, 16_384);
    body = JSON.parse(rawBody) as { name?: unknown; description?: unknown };
  } catch (error) {
    if (error instanceof Error && error.message === "request_too_large") {
      return jsonResponse({ error: "request_too_large" }, 413, origin, allowed);
    }
    return jsonResponse({ error: "invalid_json" }, 400, origin, allowed);
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (!name || name.length > 180 || !description || description.length > 5000) {
    return jsonResponse({ error: "invalid_product_content" }, 400, origin, allowed);
  }

  // Fail closed if the durable per-user limiter cannot be reached.
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: permitted, error: limitError } = await admin.rpc("consume_translation_rate_limit", {
    _user_id: userData.user.id,
  });
  if (limitError || permitted !== true) {
    return jsonResponse(
      { error: limitError ? "rate_limit_unavailable" : "rate_limit_exceeded" },
      limitError ? 503 : 429,
      origin,
      allowed,
    );
  }

  const source = await detectLanguage(`${name}\n\n${description}`, providerUrl);
  try {
    const [nameTranslations, descriptionTranslations] = await Promise.all([
      translateField(name, source, providerUrl),
      translateField(description, source, providerUrl),
    ]);
    return jsonResponse({ nameTranslations, descriptionTranslations }, 200, origin, allowed);
  } catch {
    return jsonResponse({ error: "translation_unavailable" }, 503, origin, allowed);
  }
});
