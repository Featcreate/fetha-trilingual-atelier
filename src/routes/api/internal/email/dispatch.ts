import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { getGmailAccessToken, sendPurchaseAccessEmail } from "@/lib/gmail.server";

function isAuthorized(request: Request): boolean {
  const expected = process.env["EMAIL_WORKER_SECRET"];
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\\s+/i, "") ?? "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export const Route = createFileRoute("/api/internal/email/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) return new Response("unauthorized", { status: 401 });
        let batchSize = 10;
        try {
          const body = await request.json().catch(() => ({})) as { batchSize?: unknown };
          if (typeof body.batchSize === "number" && Number.isInteger(body.batchSize)) {
            batchSize = Math.min(25, Math.max(1, body.batchSize));
          }
        } catch {
          return new Response("bad request", { status: 400 });
        }

        const appBaseUrl = process.env["APP_BASE_URL"]?.trim();
        if (!appBaseUrl) return new Response("email service not configured", { status: 503 });
        let accessToken: string;
        try {
          // Authenticate before claiming rows so missing/invalid Google credentials do not
          // consume outbox attempts.
          accessToken = await getGmailAccessToken();
        } catch {
          return new Response("email provider unavailable", { status: 503 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
          "claim_order_purchase_emails",
          { _batch_size: batchSize },
        );
        if (claimError) {
          console.error("Email outbox claim failed", claimError.message);
          return new Response("email queue unavailable", { status: 503 });
        }

        let sent = 0;
        let failed = 0;
        for (const item of claimed ?? []) {
          try {
            await sendPurchaseAccessEmail(accessToken, item.recipient_email, appBaseUrl);
            const { error } = await supabaseAdmin.rpc("complete_order_purchase_email", {
              _outbox_id: item.id,
            });
            if (error) throw new Error("outbox_complete_failed");
            sent += 1;
          } catch (error) {
            const safeError = error instanceof Error ? error.message : "email_delivery_failed";
            const { error: failError } = await supabaseAdmin.rpc("fail_order_purchase_email", {
              _outbox_id: item.id,
              _error: safeError,
            });
            if (failError) console.error("Email outbox failure update failed", failError.message);
            failed += 1;
          }
        }
        return Response.json({ claimed: claimed?.length ?? 0, sent, failed });
      },
    },
  },
});
