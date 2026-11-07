import { describe, expect, it } from "vitest";
import { ipayAmountFromMillimes } from "./ipay.server";

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
