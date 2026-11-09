import { describe, expect, it } from "vitest";
import {
  calculateIpayRefund,
  canTransitionIpayRefund,
  evaluateIpaySettlementEvidence,
  ipayRefundIdempotencyKey,
  validateIpayRefundCompletion,
  type IpaySettlementEvidence,
} from "./ipay-financial-controls";

const expected = {
  orderId: "order-123",
  paymentRef: "txn-123",
  productCode: "algorea-bazaar",
  amountMillimes: 12500,
};

const evidence: IpaySettlementEvidence = {
  source: "authoritative_provider_api",
  providerTransactionId: "txn-123",
  orderReference: "order-123",
  productCode: "algorea-bazaar",
  currency: "TND",
  currencyExponent: 3,
  amountMinor: 12500,
  fundsState: "cleared",
};

describe("iPay settlement evidence", () => {
  it("accepts only a fully matched, cleared authoritative record", () => {
    expect(evaluateIpaySettlementEvidence(expected, evidence)).toEqual({
      ok: true,
      amountMillimes: 12500,
      paymentRef: "txn-123",
      source: "authoritative_provider_api",
    });
  });

  it("does not treat webhook or browser return as settlement evidence", () => {
    for (const source of ["webhook", "browser_return"] as const) {
      expect(evaluateIpaySettlementEvidence(expected, { ...evidence, source })).toEqual({
        ok: false,
        reason: "untrusted_evidence_source",
      });
    }
  });

  it("does not treat declared bank/postal transfer or pending funds as cleared", () => {
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, fundsState: "declared" })).toEqual({
      ok: false,
      reason: "funds_not_cleared",
    });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, fundsState: "pending" }).ok).toBe(false);
  });

  it("rejects mismatched transaction, order, product, currency and amount", () => {
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, providerTransactionId: "other" })).toMatchObject({ reason: "transaction_reference_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, orderReference: "other" })).toMatchObject({ reason: "order_reference_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, productCode: "other" })).toMatchObject({ reason: "product_code_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, currency: "EUR" })).toMatchObject({ reason: "currency_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, currencyExponent: 2 })).toMatchObject({ reason: "currency_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, amountMinor: 12501 })).toMatchObject({ reason: "amount_mismatch" });
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, amountMinor: Number.MAX_SAFE_INTEGER + 1 })).toMatchObject({ reason: "invalid_amount" });
  });

  it("also accepts a bank statement matched to the same exact transaction", () => {
    expect(evaluateIpaySettlementEvidence(expected, { ...evidence, source: "bank_statement" }).ok).toBe(true);
  });
});

describe("iPay refund calculations and state", () => {
  it("supports exact partial refunds without exceeding the paid amount", () => {
    expect(calculateIpayRefund({
      originalPaidMillimes: 12500,
      previouslyRefundedMillimes: 2500,
      requestedRefundMillimes: 4000,
    })).toEqual({
      ok: true,
      refundAmountMillimes: 4000,
      totalRefundedMillimes: 6500,
      remainingRefundableMillimes: 6000,
    });
  });

  it("rejects duplicate/over-refund totals and invalid integer amounts", () => {
    expect(calculateIpayRefund({
      originalPaidMillimes: 12500,
      previouslyRefundedMillimes: 9000,
      requestedRefundMillimes: 4000,
    })).toMatchObject({ ok: false, reason: "refund_exceeds_paid_amount" });
    expect(calculateIpayRefund({
      originalPaidMillimes: 12500,
      previouslyRefundedMillimes: 0,
      requestedRefundMillimes: 0,
    })).toMatchObject({ ok: false, reason: "invalid_refund_amount" });
    expect(calculateIpayRefund({
      originalPaidMillimes: 12500,
      previouslyRefundedMillimes: -1,
      requestedRefundMillimes: 1,
    })).toMatchObject({ ok: false, reason: "invalid_previous_refunds" });
  });

  it("enforces an explicit refund state machine", () => {
    expect(canTransitionIpayRefund("requested", "approved")).toBe(true);
    expect(canTransitionIpayRefund("processing", "succeeded")).toBe(true);
    expect(canTransitionIpayRefund("succeeded", "processing")).toBe(false);
    expect(canTransitionIpayRefund("requested", "succeeded")).toBe(false);
  });

  it("requires an audit reference before a refund can be marked successful", () => {
    expect(validateIpayRefundCompletion({ state: "succeeded" })).toBe(false);
    expect(validateIpayRefundCompletion({ state: "succeeded", providerRefundRef: "refund-123" })).toBe(true);
    expect(validateIpayRefundCompletion({ state: "succeeded", manualEvidenceRef: "bank-slip-123" })).toBe(true);
  });

  it("creates a stable, unambiguous idempotency key", () => {
    const input = { orderId: "order-123", refundRequestId: "refund-req-1", amountMillimes: 2500 };
    expect(ipayRefundIdempotencyKey(input)).toBe(ipayRefundIdempotencyKey(input));
    expect(ipayRefundIdempotencyKey(input)).not.toBe(
      ipayRefundIdempotencyKey({ ...input, amountMillimes: 3000 }),
    );
  });

  it("does not collide when identifiers contain the old delimiter", () => {
    const left = ipayRefundIdempotencyKey({
      orderId: "order:a",
      refundRequestId: "b",
      amountMillimes: 2500,
    });
    const right = ipayRefundIdempotencyKey({
      orderId: "order",
      refundRequestId: "a:b",
      amountMillimes: 2500,
    });
    expect(left).not.toBe(right);
  });

  it("rejects an idempotency key longer than the database column limit", () => {
    expect(() => ipayRefundIdempotencyKey({
      orderId: "x".repeat(100),
      refundRequestId: "y".repeat(100),
      amountMillimes: 1,
    })).toThrow("ipay_refund_idempotency_key_too_long");
  });
});
