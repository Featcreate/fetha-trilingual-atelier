import { describe, expect, it } from "vitest";
import { ipayAmountFromMillimes, ipayConfig, parseIpayOneShotResponse } from "./ipay.server";

describe("iPay configuration", () => {
  it("fails closed when the amount unit has not been explicitly configured", () => {
    const keys = ["IPAY_ORG_ID", "IPAY_JWT", "IPAY_PRODUCT_CODE", "IPAY_AMOUNT_UNIT"] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.IPAY_ORG_ID = "org-test";
      process.env.IPAY_JWT = "jwt-test";
      process.env.IPAY_PRODUCT_CODE = "product-test";
      delete process.env.IPAY_AMOUNT_UNIT;
      expect(ipayConfig()).toBeNull();
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("requires explicit checkout activation even when credentials are configured", () => {
    const keys = [
      "IPAY_ORG_ID",
      "IPAY_JWT",
      "IPAY_PRODUCT_CODE",
      "IPAY_AMOUNT_UNIT",
      "IPAY_CHECKOUT_ENABLED",
    ] as const;
    const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
    try {
      process.env.IPAY_ORG_ID = "org-test";
      process.env.IPAY_JWT = "jwt-test";
      process.env.IPAY_PRODUCT_CODE = "product-test";
      process.env.IPAY_AMOUNT_UNIT = "minor";
      delete process.env.IPAY_CHECKOUT_ENABLED;
      expect(ipayConfig(true)).toBeNull();
      process.env.IPAY_CHECKOUT_ENABLED = "true";
      expect(ipayConfig(true)?.amountUnit).toBe("minor");
    } finally {
      for (const key of keys) {
        const value = previous[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });
});

describe("iPay amount conversion", () => {
  it("converts canonical TND millimes to major TND units only when explicitly configured", () => {
    expect(ipayAmountFromMillimes(12500, "major")).toBe(12.5);
  });

  it("preserves millimes when the provider contract explicitly requires minor units", () => {
    expect(ipayAmountFromMillimes(12500, "minor")).toBe(12500);
  });

  it("rejects zero, negative, fractional, and unsafe amounts", () => {
    expect(() => ipayAmountFromMillimes(0, "major")).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(-1, "minor")).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(1.5, "major")).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(Number.MAX_SAFE_INTEGER + 1, "minor")).toThrow(
      "invalid_order_amount",
    );
  });
});

describe("iPay one-shot response validation", () => {
  it("accepts a hosted HTTPS checkout URL on an iPay domain", () => {
    expect(
      parseIpayOneShotResponse({
        id: "txn-123",
        payment_url: "https://checkout.ipay.tn/pay/txn-123",
      }),
    ).toEqual({
      paymentRef: "txn-123",
      paymentUrl: "https://checkout.ipay.tn/pay/txn-123",
    });
  });

  it("rejects non-iPay hosts, credentials, non-HTTPS URLs, and unexpected ports", () => {
    for (const payment_url of [
      "https://ipay.tn.attacker.example/pay",
      "https://user@ipay.tn/pay",
      "http://ipay.tn/pay",
      "https://ipay.tn:8443/pay",
    ]) {
      expect(() => parseIpayOneShotResponse({ id: "txn-123", payment_url })).toThrow(
        "ipay_invalid_payment_url",
      );
    }
  });

  it("rejects missing or empty transaction references and oversized URLs", () => {
    expect(() => parseIpayOneShotResponse({ payment_url: "https://ipay.tn/pay" })).toThrow(
      "ipay_invalid_response",
    );
    expect(() =>
      parseIpayOneShotResponse({ id: "  ", payment_url: "https://ipay.tn/pay" }),
    ).toThrow("ipay_invalid_response");
    expect(() =>
      parseIpayOneShotResponse({
        id: "txn-123",
        payment_url: `https://ipay.tn/${"a".repeat(2048)}`,
      }),
    ).toThrow("ipay_invalid_response");
  });
});
