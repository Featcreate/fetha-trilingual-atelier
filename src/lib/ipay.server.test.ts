import { describe, expect, it } from "vitest";
import { ipayAmountFromMillimes, parseIpayOneShotResponse } from "./ipay.server";

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

  it("rejects non-iPay hosts, credentials, and non-HTTPS URLs", () => {
    for (const payment_url of [
      "https://ipay.tn.attacker.example/pay",
      "https://user@ipay.tn/pay",
      "http://ipay.tn/pay",
    ]) {
      expect(() => parseIpayOneShotResponse({ id: "txn-123", payment_url })).toThrow(
        "ipay_invalid_payment_url",
      );
    }
  });

  it("rejects missing or empty transaction references", () => {
    expect(() => parseIpayOneShotResponse({ payment_url: "https://ipay.tn/pay" })).toThrow(
      "ipay_invalid_response",
    );
    expect(() =>
      parseIpayOneShotResponse({ id: "  ", payment_url: "https://ipay.tn/pay" }),
    ).toThrow("ipay_invalid_response");
  });
});

describe("iPay one-shot response hardening", () => {
  it("accepts a numeric provider transaction id and normalizes it to a string", () => {
    expect(
      parseIpayOneShotResponse({
        id: 987654,
        payment_url: "https://ipay.tn/checkout/987654",
      }),
    ).toEqual({
      paymentRef: "987654",
      paymentUrl: "https://ipay.tn/checkout/987654",
    });
  });

  it("rejects malformed payloads and non-string checkout URLs", () => {
    for (const payload of [
      null,
      undefined,
      "not-an-object",
      {},
      { id: "txn-1", payment_url: 123 },
      { id: {}, payment_url: "https://ipay.tn/pay" },
    ]) {
      expect(() => parseIpayOneShotResponse(payload)).toThrow("ipay_invalid_response");
    }
  });

  it("rejects lookalike hosts and non-standard ports", () => {
    for (const payment_url of [
      "https://notipay.tn/pay",
      "https://ipay.tn.attacker.example/pay",
      "https://checkout.ipay.tn:444/pay",
      "https://checkout.ipay.tn:443/pay",
    ]) {
      const expected =
        payment_url === "https://checkout.ipay.tn:443/pay"
          ? "https://checkout.ipay.tn/pay"
          : undefined;
      if (expected) {
        expect(parseIpayOneShotResponse({ id: "txn-1", payment_url }).paymentUrl).toBe(expected);
      } else {
        expect(() => parseIpayOneShotResponse({ id: "txn-1", payment_url })).toThrow(
          "ipay_invalid_payment_url",
        );
      }
    }
  });

  it("rejects oversized transaction references", () => {
    expect(() =>
      parseIpayOneShotResponse({
        id: "x".repeat(201),
        payment_url: "https://ipay.tn/pay",
      }),
    ).toThrow("ipay_invalid_response");
  });
});
