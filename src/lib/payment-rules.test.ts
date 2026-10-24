import { describe, expect, it } from "vitest";
import { decidePaymentOutcome, PAYMENT_REF_PATTERN } from "./payment-rules";
import { parseTNDToMillimes } from "./money";

const order = { id: "order-1", status: "pending" as const, total_millimes: 25000 };

describe("Konnect payment decisions", () => {
  it("marks paid only when Konnect says completed with matching order and amount", () => {
    expect(decidePaymentOutcome(order, { status: "completed", amount: 25000, orderId: "order-1", token: "TND" })).toBe("paid");
  });
  it("does not pay a pending (failed or unattempted) payment", () => {
    expect(decidePaymentOutcome(order, { status: "pending", amount: 25000, orderId: "order-1" })).toBe("pending");
  });
  it("rejects a completed payment for a different amount", () => {
    expect(decidePaymentOutcome(order, { status: "completed", amount: 1000, orderId: "order-1" })).toBe("mismatch");
  });
  it("rejects a completed payment for a different order", () => {
    expect(decidePaymentOutcome(order, { status: "completed", amount: 25000, orderId: "other" })).toBe("mismatch");
  });
  it("treats a repeated notification on a paid order as already paid (no double fulfilment)", () => {
    expect(decidePaymentOutcome({ ...order, status: "paid" }, { status: "completed", amount: 25000, orderId: "order-1" })).toBe("already_paid");
  });
  it("rejects malformed payment references", () => {
    expect(PAYMENT_REF_PATTERN.test("5f9498735289e405fc7c18ac")).toBe(true);
    expect(PAYMENT_REF_PATTERN.test("../etc")).toBe(false);
  });
});

describe("TND prices", () => {
  it("converts TND to millimes", () => {
    expect(parseTNDToMillimes("12")).toBe(12000);
    expect(parseTNDToMillimes("12,5")).toBe(12500);
    expect(parseTNDToMillimes("0")).toBeNull();
    expect(parseTNDToMillimes("-3")).toBeNull();
  });
});
