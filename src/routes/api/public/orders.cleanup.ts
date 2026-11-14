import { timingSafeEqual } from "node:crypto";
import { createFileRoute } from "@tanstack/react-router";
import { runExpiredUnpaidOrderCleanup } from "@/lib/order-cleanup.server";

export const Route = createFileRoute("/api/public/orders/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supplied = request.headers.get("x-ipay-reconcile-secret")?.trim() ?? "";
        const expected = process.env["IPAY_RECONCILE_CRON_SECRET"]?.trim() ?? "";
        const suppliedBytes = Buffer.from(supplied, "utf8");
        const expectedBytes = Buffer.from(expected, "utf8");
        const authorized =
          expectedBytes.length > 0 &&
          suppliedBytes.length === expectedBytes.length &&
          timingSafeEqual(suppliedBytes, expectedBytes);

        if (!authorized) {
          return new Response("Unauthorized", {
            status: 401,
            headers: { "Cache-Control": "no-store" },
          });
        }

        try {
          const deletedOrders = await runExpiredUnpaidOrderCleanup();
          return Response.json(
            { ok: true, deletedOrders },
            { status: 200, headers: { "Cache-Control": "no-store" } },
          );
        } catch (error) {
          console.error(
            "Expired unpaid order cleanup request failed",
            error instanceof Error ? error.message : "unknown",
          );
          return new Response("Order cleanup temporarily unavailable", {
            status: 503,
            headers: { "Cache-Control": "no-store" },
          });
        }
      },
    },
  },
});
