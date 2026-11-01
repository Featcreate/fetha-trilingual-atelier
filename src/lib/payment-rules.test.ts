import { describe, expect, it } from "vitest";
import { decidePaymentOutcome, PAYMENT_REF_PATTERN } from "./payment-rules";
import { parseTNDToMillimes } from "./money";

const order = { id: "order-1", status: "pending" as const, total_millimes: 25000 };
const completedPayment = {
  status: "completed",
  amount: 25000,
  amountDue: 25000,
  reachedAmount: 25000,
  orderId: "order-1",
  token: "TND",
};

describe("Konnect payment decisions", () => {
  it("marks paid only when Konnect confirms the full TND amount for the same order", () => {
    expect(decidePaymentOutcome(order, completedPayment)).toBe("paid");
  });

  it("does not pay a pending (failed or unattempted) payment", () => {
    expect(decidePaymentOutcome(order, { ...completedPayment, status: "pending" })).toBe("pending");
  });

  it("rejects a completed payment for a different amount", () => {
    expect(decidePaymentOutcome(order, { ...completedPayment, amount: 1000 })).toBe("mismatch");
  });

  it("rejects partial payments even when a transaction amount is present", () => {
    expect(
      decidePaymentOutcome(order, {
        ...completedPayment,
        amount: 10000,
        reachedAmount: 10000,
      }),
    ).toBe("mismatch");
  });

  it("rejects a completed payment for a different order", () => {
    expect(decidePaymentOutcome(order, { ...completedPayment, orderId: "other" })).toBe("mismatch");
  });

  it("rejects a completed payment when currency is missing or not TND", () => {
    const withoutCurrency = {
      status: completedPayment.status,
      amount: completedPayment.amount,
      amountDue: completedPayment.amountDue,
      reachedAmount: completedPayment.reachedAmount,
      orderId: completedPayment.orderId,
    };
    expect(decidePaymentOutcome(order, withoutCurrency)).toBe("mismatch");
    expect(decidePaymentOutcome(order, { ...completedPayment, token: "USD" })).toBe("mismatch");
  });

  it("treats a repeated notification on a paid order as already paid", () => {
    expect(decidePaymentOutcome({ ...order, status: "paid" }, completedPayment)).toBe(
      "already_paid",
    );
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
