/**
 * Fail-closed financial controls for the future iPay reconciliation/refund adapter.
 *
 * This module intentionally performs no network requests and writes no ledger rows.
 * Callers must supply evidence obtained from a confirmed authoritative source.
 */
export type IpayEvidenceSource =
  | "authoritative_provider_api"
  | "bank_statement"
  | "webhook"
  | "browser_return";

export type IpayFundsState = "cleared" | "pending" | "declared" | "unknown";

export type IpayExpectedPayment = {
  orderId: string;
  paymentRef: string;
  productCode: string;
  amountMillimes: number;
};

export type IpaySettlementEvidence = {
  source: IpayEvidenceSource;
  providerTransactionId: string;
  orderReference: string;
  productCode: string;
  currency: string;
  currencyExponent: number;
  amountMinor: number;
  fundsState: IpayFundsState;
};

export type IpaySettlementDecision =
  | { ok: true; amountMillimes: number; paymentRef: string; source: "authoritative_provider_api" | "bank_statement" }
  | {
      ok: false;
      reason:
        | "untrusted_evidence_source"
        | "funds_not_cleared"
        | "transaction_reference_mismatch"
        | "order_reference_mismatch"
        | "product_code_mismatch"
        | "currency_mismatch"
        | "amount_mismatch"
        | "invalid_amount";
    };

function positiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

/**
 * Only an authoritative provider lookup or a matched bank statement can
 * establish settlement. Webhooks and browser redirects are signals only.
 * A completed/declaration event must be normalized to "declared", never "cleared".
 */
export function evaluateIpaySettlementEvidence(
  expected: IpayExpectedPayment,
  evidence: IpaySettlementEvidence,
): IpaySettlementDecision {
  if (evidence.source !== "authoritative_provider_api" && evidence.source !== "bank_statement") {
    return { ok: false, reason: "untrusted_evidence_source" };
  }
  if (evidence.fundsState !== "cleared") {
    return { ok: false, reason: "funds_not_cleared" };
  }
  if (!expected.paymentRef || evidence.providerTransactionId !== expected.paymentRef) {
    return { ok: false, reason: "transaction_reference_mismatch" };
  }
  if (!expected.orderId || evidence.orderReference !== expected.orderId) {
    return { ok: false, reason: "order_reference_mismatch" };
  }
  if (!expected.productCode || evidence.productCode !== expected.productCode) {
    return { ok: false, reason: "product_code_mismatch" };
  }
  if (evidence.currency !== "TND" || evidence.currencyExponent !== 3) {
    return { ok: false, reason: "currency_mismatch" };
  }
  if (
    !positiveSafeInteger(expected.amountMillimes) ||
    !positiveSafeInteger(evidence.amountMinor)
  ) {
    return { ok: false, reason: "invalid_amount" };
  }
  if (evidence.amountMinor !== expected.amountMillimes) {
    return { ok: false, reason: "amount_mismatch" };
  }
  return {
    ok: true,
    amountMillimes: evidence.amountMinor,
    paymentRef: evidence.providerTransactionId,
    source: evidence.source,
  };
}

export type IpayRefundState =
  | "requested"
  | "approved"
  | "processing"
  | "succeeded"
  | "failed"
  | "cancelled";

const REFUND_TRANSITIONS: Record<IpayRefundState, readonly IpayRefundState[]> = {
  requested: ["approved", "cancelled"],
  approved: ["processing", "cancelled"],
  processing: ["succeeded", "failed"],
  failed: ["processing", "cancelled"],
  succeeded: [],
  cancelled: [],
};

export function canTransitionIpayRefund(
  current: IpayRefundState,
  next: IpayRefundState,
): boolean {
  return REFUND_TRANSITIONS[current].includes(next);
}

export type IpayRefundCalculation =
  | { ok: true; refundAmountMillimes: number; totalRefundedMillimes: number; remainingRefundableMillimes: number }
  | { ok: false; reason: "invalid_original_amount" | "invalid_previous_refunds" | "invalid_refund_amount" | "refund_exceeds_paid_amount" };

/** Calculate a full or partial refund using integer TND millimes only. */
export function calculateIpayRefund(input: {
  originalPaidMillimes: number;
  previouslyRefundedMillimes: number;
  requestedRefundMillimes: number;
}): IpayRefundCalculation {
  const { originalPaidMillimes, previouslyRefundedMillimes, requestedRefundMillimes } = input;
  if (!positiveSafeInteger(originalPaidMillimes)) {
    return { ok: false, reason: "invalid_original_amount" };
  }
  if (
    !Number.isSafeInteger(previouslyRefundedMillimes) ||
    previouslyRefundedMillimes < 0 ||
    previouslyRefundedMillimes > originalPaidMillimes
  ) {
    return { ok: false, reason: "invalid_previous_refunds" };
  }
  if (!positiveSafeInteger(requestedRefundMillimes)) {
    return { ok: false, reason: "invalid_refund_amount" };
  }
  const totalRefundedMillimes = previouslyRefundedMillimes + requestedRefundMillimes;
  if (
    !Number.isSafeInteger(totalRefundedMillimes) ||
    totalRefundedMillimes > originalPaidMillimes
  ) {
    return { ok: false, reason: "refund_exceeds_paid_amount" };
  }
  return {
    ok: true,
    refundAmountMillimes: requestedRefundMillimes,
    totalRefundedMillimes,
    remainingRefundableMillimes: originalPaidMillimes - totalRefundedMillimes,
  };
}

/**
 * Stable, unambiguous key for one approved refund instruction.
 * Each variable-length identifier is URI-encoded before delimiting, so
 * separator characters inside an identifier cannot create tuple collisions.
 * The SQL reservation table accepts keys up to 200 characters.
 */
export function ipayRefundIdempotencyKey(input: {
  orderId: string;
  refundRequestId: string;
  amountMillimes: number;
}): string {
  const orderId = input.orderId.trim();
  const refundRequestId = input.refundRequestId.trim();
  if (
    !orderId ||
    !refundRequestId ||
    !positiveSafeInteger(input.amountMillimes)
  ) {
    throw new Error("invalid_refund_idempotency_input");
  }

  const key = [
    "ipay",
    "refund",
    "v1",
    encodeURIComponent(orderId),
    encodeURIComponent(refundRequestId),
    String(input.amountMillimes),
  ].join(":");

  if (key.length > 200) {
    throw new Error("ipay_refund_idempotency_key_too_long");
  }
  return key;
}

/** A successful refund must have an auditable provider or manual reference. */
export function validateIpayRefundCompletion(input: {
  state: IpayRefundState;
  providerRefundRef?: string | null;
  manualEvidenceRef?: string | null;
}): boolean {
  if (input.state !== "succeeded") return true;
  return Boolean(input.providerRefundRef?.trim() || input.manualEvidenceRef?.trim());
}
