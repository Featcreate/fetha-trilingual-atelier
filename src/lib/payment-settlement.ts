import type { BuyerPaymentProviderId } from "./payment-providers";

export type ProviderVerification = {
  status: "paid" | "pending" | "failed" | "mismatch";
  orderId: string;
  providerReference: string;
  amountMillimes: number;
  currency: string;
};

export type ExpectedProviderPayment = {
  orderId: string;
  providerId: BuyerPaymentProviderId;
  providerReference: string;
  amountMillimes: number;
  currency: "TND";
};

/**
 * Pure guard immediately before the marketplace's existing settlement RPC.
 * This does not post ledger entries; callers must still use the single
 * transactional, idempotent settlement function after this returns true.
 */
export function isAuthoritativePaymentMatch(
  expected: ExpectedProviderPayment,
  verified: ProviderVerification,
): boolean {
  if (verified.status !== "paid") return false;
  if (!expected.orderId || !expected.providerReference) return false;
  if (verified.orderId !== expected.orderId) return false;
  if (verified.providerReference !== expected.providerReference) return false;
  if (verified.currency !== expected.currency || verified.currency !== "TND") return false;
  if (!Number.isSafeInteger(expected.amountMillimes) || expected.amountMillimes <= 0) {
    return false;
  }
  return (
    Number.isSafeInteger(verified.amountMillimes) &&
    verified.amountMillimes === expected.amountMillimes
  );
}
