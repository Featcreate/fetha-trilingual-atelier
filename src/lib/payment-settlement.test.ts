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
  providerId: "konnect",
  status: "paid",
  orderId: "order-123",
  providerReference: "provider-ref-123",
  amountMillimes: 12500,
  currency: "TND",
};

describe("authoritative provider payment matching", () => {
  it("accepts an exact paid match from the selected provider", () => {
    expect(isAuthoritativePaymentMatch(expected, verified)).toBe(true);
  });

  it.each([
    ["pending", { ...verified, status: "pending" }],
    ["failed", { ...verified, status: "failed" }],
    ["mismatch", { ...verified, status: "mismatch" }],
    ["wrong provider", { ...verified, providerId: "ipay" }],
    ["wrong order", { ...verified, orderId: "another-order" }],
    ["wrong reference", { ...verified, providerReference: "another-ref" }],
    ["wrong amount", { ...verified, amountMillimes: 12501 }],
    ["wrong currency", { ...verified, currency: "EUR" }],
    ["fractional amount", { ...verified, amountMillimes: 12500.5 }],
  ] as const)("rejects %s", (_label, candidate) => {
    expect(isAuthoritativePaymentMatch(expected, candidate)).toBe(false);
  });

  it("rejects invalid expected amounts", () => {
    expect(isAuthoritativePaymentMatch({ ...expected, amountMillimes: 0 }, verified)).toBe(false);
  });

  it.each([0, -1, 1.25, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects unsafe or non-positive verified amount %s",
    (amountMillimes) => {
      expect(
        isAuthoritativePaymentMatch(expected, {
          ...verified,
          amountMillimes,
        }),
      ).toBe(false);
    },
  );

  it("rejects missing order and provider references", () => {
    expect(isAuthoritativePaymentMatch({ ...expected, orderId: "" }, verified)).toBe(false);
    expect(
      isAuthoritativePaymentMatch({ ...expected, providerReference: "" }, verified),
    ).toBe(false);
    expect(
      isAuthoritativePaymentMatch(expected, {
        ...verified,
        providerReference: "",
      }),
    ).toBe(false);
  });

  it("rejects an expected non-TND currency even if both sides match", () => {
    expect(
      isAuthoritativePaymentMatch(
        { ...expected, currency: "EUR" as "TND" },
        { ...verified, currency: "EUR" },
      ),
    ).toBe(false);
  });
});
