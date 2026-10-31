// Pure payment decision rules shared by the Konnect webhook and the return-page check.

export interface OrderForPayment {
  id: string;
  status: "pending" | "paid" | "failed" | "cancelled";
  total_millimes: number;
}

/** Subset of Konnect GET /payments/:id → payment */
export interface KonnectPayment {
  status?: string;
  amount?: number;
  orderId?: string;
  token?: string;
}

export type PaymentOutcome = "paid" | "already_paid" | "pending" | "mismatch" | "order_closed";

export function decidePaymentOutcome(
  order: OrderForPayment,
  payment: KonnectPayment,
): PaymentOutcome {
  if (order.status === "paid") return "already_paid";
  if (order.status !== "pending") return "order_closed";
  // Konnect: only payment.status === "completed" means paid; "pending" covers failed or not attempted.
  if (payment.status !== "completed") return "pending";
  if (payment.orderId !== order.id) return "mismatch";
  if (payment.amount !== order.total_millimes) return "mismatch";
  if (payment.token !== "TND") return "mismatch";
  return "paid";
}

export const PAYMENT_REF_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;
