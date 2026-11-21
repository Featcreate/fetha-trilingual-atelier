import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { createRemoteJWKSet, jwtVerify } from "https://deno.land/x/jose@v5.9.6/index.ts";

const repo = "Featcreate/fetha-trilingual-atelier";
const workflow =
  "Featcreate/fetha-trilingual-atelier/.github/workflows/clamav-file-scan.yml@refs/heads/main";
const issuer = "https://token.actions.githubusercontent.com";
const jwks = createRemoteJWKSet(
  new URL("https://token.actions.githubusercontent.com/.well-known/jwks"),
);

const cors = {
  "Access-Control-Allow-Origin": "https://github.com",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

async function verifyRunner(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token || token === authorization) throw new Error("runner_identity_required");
  const { payload } = await jwtVerify(token, jwks, {
    issuer,
    audience: "algorea-file-scan",
  });
  if (
    payload.repository !== repo ||
    payload.ref !== "refs/heads/main" ||
    payload.workflow_ref !== workflow ||
    (payload.event_name !== "push" && payload.event_name !== "schedule" && payload.event_name !== "workflow_dispatch")
  ) {
    throw new Error("runner_identity_not_allowed");
  }
}

// prettier-ignore
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return respond(405, { error: "method_not_allowed" });

  try {
    await verifyRunner(req);
    const body = await req.json().catch(() => ({}));
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("scanner_service_configuration_missing");
    const admin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (body.action === "claim") {
      const { data, error } = await admin.rpc("claim_next_product_file_scan");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : null;
      if (!row) return respond(200, { claimed: false });
      const { data: signed, error: signError } = await admin.storage
        .from("product-files")
        .createSignedUrl(row.storage_path, 600);
      if (signError || !signed?.signedUrl) {
        await admin.rpc("complete_product_file_scan", {
          _version_id: row.version_id,
          _result: "error",
          _scanned_sha256: null,
          _error_code: "signed_url_creation_failed",
        });
        throw new Error("signed_url_creation_failed");
      }
      return respond(200, {
        claimed: true,
        versionId: row.version_id,
        sizeBytes: row.size_bytes,
        signedUrl: signed.signedUrl,
      });
    }

    if (body.action === "complete") {
      if (
        typeof body.versionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(body.versionId) ||
        !["clean", "infected", "error"].includes(body.result) ||
        (body.sha256 !== null && body.sha256 !== undefined &&
          (typeof body.sha256 !== "string" || !/^[0-9a-f]{64}$/i.test(body.sha256)))
      ) {
        return respond(400, { error: "invalid_scan_result" });
      }

      const { error } = await admin.rpc("complete_product_file_scan", {
        _version_id: body.versionId,
        _result: body.result,
        _scanned_sha256: body.sha256 ?? null,
        _error_code: typeof body.errorCode === "string" ? body.errorCode.slice(0, 80) : null,
      });
      if (error) throw error;
      return respond(200, { accepted: true });
    }

    return respond(400, { error: "unknown_action" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "scanner_error";
    const denied = message.includes("runner_identity");
    return respond(denied ? 401 : 500, {
      error: denied ? "unauthorized_runner" : "scanner_operation_failed",
    });
  }
});
