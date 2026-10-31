import { describe, expect, it } from "vitest";
import { isKonnectPaymentEnabled } from "./payment-activation";

describe("Konnect payment activation", () => {
  it("keeps payments disabled unless the selected mode is explicitly enabled", () => {
    expect(isKonnectPaymentEnabled({})).toBe(false);
    expect(isKonnectPaymentEnabled({ KONNECT_ENV: "sandbox" })).toBe(false);
    expect(isKonnectPaymentEnabled({ KONNECT_ENV: "live" })).toBe(false);
  });

  it("allows sandbox only with its dedicated explicit switch", () => {
    expect(isKonnectPaymentEnabled({ KONNECT_SANDBOX_PAYMENTS_ENABLED: "true" })).toBe(true);
    expect(
      isKonnectPaymentEnabled({
        KONNECT_ENV: "sandbox",
        KONNECT_SANDBOX_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      isKonnectPaymentEnabled({
        KONNECT_ENV: "sandbox",
        KONNECT_LIVE_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(false);
  });

  it("requires a separate live switch and rejects unknown modes", () => {
    expect(
      isKonnectPaymentEnabled({
        KONNECT_ENV: "live",
        KONNECT_SANDBOX_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(false);
    expect(
      isKonnectPaymentEnabled({
        KONNECT_ENV: "live",
        KONNECT_LIVE_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(true);
    expect(
      isKonnectPaymentEnabled({
        KONNECT_ENV: "production",
        KONNECT_LIVE_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(false);
  });
});
