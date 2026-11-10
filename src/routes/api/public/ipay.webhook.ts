import { createFileRoute } from "@tanstack/react-router";

/**
 * Deliberately fail-closed iPay webhook ingress.
 *
 * The provider contract currently available to this project does not document
 * webhook authentication/signature verification or an authoritative
 * transaction-settlement lookup. Consequently this endpoint must not parse,
 * trust, persist, or act on incoming event bodies.
 *
 * Replace this guard only after the provider's verification contract has been
 * confirmed and covered by tests. Do not configure this URL in the iPay
 * dashboard while it returns 503.
 */
export const Route = createFileRoute("/api/public/ipay/webhook")({
  server: {
    handlers: {
      POST: async () =>
        new Response("iPay webhook processing is not enabled", {
          status: 503,
          headers: {
            "Cache-Control": "no-store",
            "Content-Type": "text/plain; charset=utf-8",
          },
        }),
    },
  },
});
