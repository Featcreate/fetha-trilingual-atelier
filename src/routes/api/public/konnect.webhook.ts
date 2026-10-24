import { createFileRoute } from "@tanstack/react-router";
import { PAYMENT_REF_PATTERN } from "@/lib/payment-rules";

// Konnect calls this with GET ?payment_ref=... . The notification itself is NOT trusted:
// the payment is re-fetched from Konnect's API with our secret key before any order changes.
export const Route = createFileRoute("/api/public/konnect/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const ref = new URL(request.url).searchParams.get("payment_ref") ?? "";
        if (!PAYMENT_REF_PATTERN.test(ref)) return new Response("bad request", { status: 400 });
        const { konnectConfig, applyPaymentRef } = await import("@/lib/konnect.server");
        if (!konnectConfig()) return new Response("not configured", { status: 503 });
        try {
          await applyPaymentRef(ref, "webhook");
          return new Response("ok");
        } catch (e) {
          console.error("konnect webhook failed", e instanceof Error ? e.message : "unknown");
          return new Response("error", { status: 500 });
        }
      },
    },
  },
});
