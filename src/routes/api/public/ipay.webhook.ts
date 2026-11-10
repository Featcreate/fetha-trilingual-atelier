import { createFileRoute } from "@tanstack/react-router";
import { processIpaySettlementNotice } from "@/lib/ipay-settlement.server";

/**
 * iPay sends unsigned notifications. Treat the body as an untrusted trigger only;
 * the service performs an authenticated server-to-server GET before any write.
 */
export const Route = createFileRoute("/api/public/ipay/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
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
