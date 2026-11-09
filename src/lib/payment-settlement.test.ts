import { describe, expect, it } from "vitest";
import { isAuthoritativePaymentMatch } from "./payment-settlement";
import type { ExpectedProviderPayment, ProviderVerification } from "./payment-settlement";

const expected: ExpectedProviderPayment = {
  orderId: "order-123",
  providerId: "konnect",
  providerReference: "provider-ref-123",
  amountMillimes: 12500,
  currency: "TND",
};
const verified: ProviderVerification = {
  status: "paid",
  orderId: "order-123",
  providerReference: "provider-ref-123",
  amountMillimes: 12500,
  currency: "TND",
};

describe("authoritative provider payment matching", () => {
  it("accepts an exact paid match", () => {
    expect(isAuthoritativePaymentMatch(expected, verified)).toBe(true);
  });

  it.each([
    ["pending", { ...verified, status: "pending" }],
    ["failed", { ...verified, status: "failed" }],
    ["mismatch", { ...verified, status: "mismatch" }],
    ["wrong order", { ...verified, orderId: "another-order" }],
    ["wrong reference", { ...verified, providerReference: "another-ref" }],
    ["wrong amount", { ...verified, amountMillimes: 12501 }],
    ["wrong currency", { ...verified, currency: "EUR" }],
    ["fractional amount", { ...verified, amountMillimes: 12500.5 }],
  ] as const)("rejects %s", (_label, candidate) => {
    expect(isAuthoritativePaymentMatch(expected, candidate)).toBe(false);
  });

  it("rejects invalid expected amounts", () => {
    expect(isAuthoritativePaymentMatch(
      { ...expected, amountMillimes: 0 },
      verified,
    )).toBe(false);
  });
});
