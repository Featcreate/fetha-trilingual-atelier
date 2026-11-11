import { createHash, timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import {
  processIpayReconciliationBatch,
  processIpaySettlementNotice,
} from "@/lib/ipay-settlement.server";

/**
 * iPay sends unsigned notifications. Treat the body as an untrusted trigger only;
 * the service performs an authenticated server-to-server GET before any write.
 */
export const Route = createFileRoute("/api/public/ipay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Scheduled reconciliation uses a separate high-entropy secret.
        // The public iPay webhook remains unsigned and is only an untrusted trigger.
        const suppliedSecretHeader = request.headers.get("x-ipay-reconcile-secret");
        if (suppliedSecretHeader !== null) {
          // Normalize accidental leading/trailing whitespace from dashboard copy/paste.
          const suppliedSecret = suppliedSecretHeader.trim();
          const expectedSecret = process.env["IPAY_RECONCILE_CRON_SECRET"]?.trim();
          const fingerprint = (value: string) =>
            createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
          const matches =
            Boolean(expectedSecret) &&
            Buffer.byteLength(suppliedSecret) === Buffer.byteLength(expectedSecret!) &&
            timingSafeEqual(Buffer.from(suppliedSecret), Buffer.from(expectedSecret!));
          if (!matches) {
            // Fingerprints and lengths are safe diagnostics; never log either secret.
            console.warn("iPay reconciliation authentication rejected", {
              expectedPresent: Boolean(expectedSecret),
              expectedLength: expectedSecret ? Buffer.byteLength(expectedSecret) : 0,
              suppliedLength: Buffer.byteLength(suppliedSecret),
              expectedFingerprint: expectedSecret ? fingerprint(expectedSecret) : null,
              suppliedFingerprint: fingerprint(suppliedSecret),
            });
            return new Response("Unauthorized", {
              status: 401,
              headers: { "Cache-Control": "no-store" },
            });
          }

          try {
            const summary = await processIpayReconciliationBatch();
            return Response.json(
              { ok: true, summary },
              { status: 200, headers: { "Cache-Control": "no-store" } },
            );
          } catch (error) {
            console.error(
              "iPay scheduled reconciliation failed",
              error instanceof Error ? error.message : "unknown",
            );
            return new Response("Reconciliation temporarily unavailable", {
              status: 503,
              headers: { "Cache-Control": "no-store" },
            });
          }
        }
        let notice: unknown;
        try {
          const body = await request.text();
          if (body.length > 16_384) {
            return new Response("Webhook payload too large", {
              status: 413,
              headers: { "Cache-Control": "no-store" },
            });
          }
          notice = JSON.parse(body);
        } catch {
          return new Response("Invalid webhook payload", {
            status: 400,
            headers: { "Cache-Control": "no-store" },
          });
        }
        if (!notice || typeof notice !== "object" || Array.isArray(notice)) {
          return new Response("Invalid webhook payload", {
            status: 400,
            headers: { "Cache-Control": "no-store" },
          });
        }

        try {
          // The documented iPay webhook envelope stores transaction fields in data.
          // Accept the documented envelope and a flat form, but never trust its status/amount.
          const envelope = notice as Record<string, unknown>;
          const webhookData = envelope["data"];
          let payload = envelope;
          if (
            webhookData !== null &&
            typeof webhookData === "object" &&
            !Array.isArray(webhookData)
          ) {
            payload = webhookData as Record<string, unknown>;
          }
          const result = await processIpaySettlementNotice(
            {
              id: payload["id"],
              invoice_reference: payload["invoice_reference"],
            },
            "webhook",
          );
          const status = result.outcome === "pending" ? 202 : 200;
          return Response.json(
            { received: true, outcome: result.outcome },
            { status, headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          console.error(
            "iPay webhook verification failed",
            error instanceof Error ? error.message : "unknown",
          );
          // Keep provider retry behavior safe: no settlement occurred on this path.
          return new Response("iPay verification temporarily unavailable", {
            status: 503,
            headers: {
              "Cache-Control": "no-store",
              "Content-Type": "text/plain; charset=utf-8",
            },
          });
        }
      },
    },
  },
});
