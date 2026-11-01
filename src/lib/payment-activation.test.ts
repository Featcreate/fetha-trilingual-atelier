import { describe, expect, it } from "vitest";
import { isKonnectPaymentEnabled, selectedCollectionProvider } from "./payment-activation";

describe("collection provider selection", () => {
  it("preserves Konnect as the current default", () => {
    expect(selectedCollectionProvider({})).toBe("konnect");
    expect(selectedCollectionProvider({ PAYMENT_COLLECTION_PROVIDER: "konnect" })).toBe("konnect");
  });

  it("can disable collection without changing marketplace accounting", () => {
    expect(
      selectedCollectionProvider({ PAYMENT_COLLECTION_PROVIDER: "disabled" }),
    ).toBe("disabled");
    expect(
      isKonnectPaymentEnabled({
        PAYMENT_COLLECTION_PROVIDER: "disabled",
        KONNECT_ENV: "sandbox",
        KONNECT_SANDBOX_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(false);
  });

  it("fails closed for providers that do not yet have an implemented adapter", () => {
    expect(selectedCollectionProvider({ PAYMENT_COLLECTION_PROVIDER: "stripe" })).toBeNull();
    expect(
      isKonnectPaymentEnabled({
        PAYMENT_COLLECTION_PROVIDER: "stripe",
        KONNECT_ENV: "live",
        KONNECT_LIVE_PAYMENTS_ENABLED: "true",
      }),
    ).toBe(false);
  });
});

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
