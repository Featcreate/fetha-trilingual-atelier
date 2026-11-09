/**
 * Fail-closed settlement verification controls for the future iPay adapter.
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
