import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createDownloadResponse } from "@/lib/download-stream";

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

        const entitlementId = new URL(request.url).searchParams.get("entitlementId") ?? "";
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entitlementId)) {
          return new Response("bad request", { status: 400 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: reservations, error: reserveError } = await supabaseAdmin.rpc(
          "reserve_download",
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

        const { data: file, error: fileError } = await supabaseAdmin.storage
          .from("product-files")
          .download(reservation.storage_path);
        if (fileError || !file) {
          await supabaseAdmin.rpc("release_download", {
            _reservation_id: reservation.reservation_id,
          });
          return new Response("file unavailable", { status: 503 });
        }

        return createDownloadResponse({
          blob: file,
          fileName: reservation.file_name,
          finalize: async () => {
            const { data, error } = await supabaseAdmin.rpc("finalize_download", {
              _reservation_id: reservation.reservation_id,
            });
            return !error && data === true;
          },
          release: async () => {
            await supabaseAdmin.rpc("release_download", {
              _reservation_id: reservation.reservation_id,
            });
          },
        });
      },
    },
  },
});
