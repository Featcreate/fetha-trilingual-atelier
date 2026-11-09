import { describe, expect, it } from "vitest";
import {
  evaluateIpaySettlementEvidence,
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
