import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createDownloadResponse, createSingleFileZipStream } from "@/lib/download-stream";

function isNewApiKey(value: string) {
  return value.startsWith("sb_publishable_") || value.startsWith("sb_secret_");
}

export const Route = createFileRoute("/api/download")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        if (!authorization.startsWith("Bearer ")) {
          return new Response("unauthorized", { status: 401 });
        }
        const token = authorization.slice("Bearer ".length);
        if (!token || token.split(".").length !== 3) {
          return new Response("unauthorized", { status: 401 });
        }

        const supabaseUrl = process.env["SUPABASE_URL"];
        const publishableKey = process.env["SUPABASE_PUBLISHABLE_KEY"];
        if (!supabaseUrl || !publishableKey) {
          return new Response("download service unavailable", { status: 503 });
        }

        const userClient = createClient<Database>(supabaseUrl, publishableKey, {
          global: {
            headers: { Authorization: `Bearer ${token}` },
            fetch: (input, init) => {
              const headers = new Headers(
                typeof Request !== "undefined" && input instanceof Request
                  ? input.headers
                  : undefined,
              );
              if (init?.headers) new Headers(init.headers).forEach((v, k) => headers.set(k, v));
              if (
                isNewApiKey(publishableKey) &&
                headers.get("Authorization") === `Bearer ${publishableKey}`
              ) headers.delete("Authorization");
              headers.set("apikey", publishableKey);
              return fetch(input, { ...init, headers });
            },
          },
          auth: { persistSession: false, autoRefreshToken: false },
        });

        const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
        const userId = claims?.claims?.sub;
        if (claimsError || typeof userId !== "string") {
          return new Response("unauthorized", { status: 401 });
        }

        const url = new URL(request.url);
        const entitlementId = url.searchParams.get("entitlementId") ?? "";
        const downloadType = url.searchParams.get("type") ?? "original";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entitlementId)) {
          return new Response("bad request", { status: 400 });
        }
        if (downloadType !== "original" && downloadType !== "zip") {
          return new Response("bad download type", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const reserveRpc = downloadType === "zip" ? "reserve_zip_download" : "reserve_download";
        const { data: reservations, error: reserveError } = await supabaseAdmin.rpc(
          reserveRpc,
          { _user_id: userId, _entitlement_id: entitlementId },
        );
        const reservation = reservations?.[0];
        if (reserveError || !reservation) {
          return new Response("download unavailable", { status: 503 });
        }
        if (
          reservation.outcome !== "new" ||
          !reservation.reservation_id ||
          !reservation.storage_path ||
          !reservation.file_name
        ) {
          const status = reservation.outcome === "forbidden" ? 403
            : reservation.outcome === "busy" ? 409
            : reservation.outcome === "quota_exhausted" ? 410
            : reservation.outcome === "not_paid" ? 402
            : 404;
          return new Response(reservation.outcome, { status });
        }

        const release = async () => {
          if (downloadType === "zip") {
            await supabaseAdmin.rpc("release_zip_download", {
              _reservation_id: reservation.reservation_id,
            });
          } else {
            await supabaseAdmin.rpc("release_download", {
              _reservation_id: reservation.reservation_id,
            });
          }
        };

        try {
          if (request.signal.aborted) {
            await release();
            return new Response("request aborted", { status: 499 });
          }

          const { data: signed, error: signError } = await supabaseAdmin.storage
            .from("product-files")
            .createSignedUrl(reservation.storage_path, 60, { download: reservation.file_name });
          if (signError || !signed?.signedUrl) {
            await release();
            return new Response("file unavailable", { status: 503 });
          }

          const upstream = await fetch(signed.signedUrl, {
            method: "GET",
            cache: "no-store",
            signal: request.signal,
          });
          if (!upstream.ok || !upstream.body) {
            await release();
            return new Response("file unavailable", { status: 503 });
          }

          const source = downloadType === "zip"
            ? createSingleFileZipStream(upstream.body, reservation.file_name)
            : upstream.body;
          const fileName = downloadType === "zip"
            ? `${reservation.file_name.replace(/\\.[^.]+$/, "") || reservation.file_name}.zip`
            : reservation.file_name;

          return createDownloadResponse({
            source,
            fileName,
            contentType: downloadType === "zip"
              ? "application/zip"
              : upstream.headers.get("content-type") ?? "application/octet-stream",
            contentLength: downloadType === "original"
              ? upstream.headers.get("content-length")
              : null,
            finalize: async () => {
              const { data, error } = downloadType === "zip"
                ? await supabaseAdmin.rpc("finalize_zip_download", {
                    _reservation_id: reservation.reservation_id,
                  })
                : await supabaseAdmin.rpc("finalize_download", {
                    _reservation_id: reservation.reservation_id,
                  });
              return !error && data === true;
            },
            release,
          });
        } catch {
          await release();
          return new Response(request.signal.aborted ? "request aborted" : "file unavailable", {
            status: request.signal.aborted ? 499 : 503,
          });
        }
      },
    },
  },
});
