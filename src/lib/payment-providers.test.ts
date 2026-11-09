import { describe, expect, it } from "vitest";
import {
  eligibleBuyerPaymentProviders,
  findEligibleBuyerPaymentProvider,
  type BuyerPaymentProviderOption,
} from "./payment-providers";

const providers: BuyerPaymentProviderOption[] = [
  {
    id: "konnect",
    label: "Konnect",
    enabled: true,
    supportedCountries: ["TN", "FR"],
    supportedCurrencies: ["TND"],
    methods: ["bank_card", "wallet"],
  },
  {
    id: "ipay",
    label: "iPay",
    enabled: true,
    supportedCountries: ["TN"],
    supportedCurrencies: ["TND"],
    methods: ["local_card"],
  },
  {
    id: "future-provider",
    label: "Future provider",
    enabled: false,
    supportedCountries: ["TN", "FR"],
    supportedCurrencies: ["TND"],
    methods: ["card"],
  },
];

describe("buyer payment provider eligibility", () => {
  it("returns only enabled providers explicitly supporting the buyer country and currency", () => {
    expect(
      eligibleBuyerPaymentProviders(providers, {
        buyerCountry: "tn",
        currency: "tnd",
        amountMillimes: 12500,
      }).map((provider) => provider.id),
    ).toEqual(["konnect", "ipay"]);
  });

  it("does not expose iPay to a country outside its configured coverage", () => {
    expect(
      eligibleBuyerPaymentProviders(providers, {
        buyerCountry: "FR",
        currency: "TND",
        amountMillimes: 12500,
      }).map((provider) => provider.id),
    ).toEqual(["konnect"]);
  });

  it("fails closed for unsupported currencies, invalid countries and invalid amounts", () => {
    expect(eligibleBuyerPaymentProviders(providers, {
      buyerCountry: "TN", currency: "EUR", amountMillimes: 12500,
    })).toEqual([]);
    expect(eligibleBuyerPaymentProviders(providers, {
      buyerCountry: "TUN", currency: "TND", amountMillimes: 12500,
    })).toEqual([]);
    expect(eligibleBuyerPaymentProviders(providers, {
      buyerCountry: "TN", currency: "TND", amountMillimes: 0,
    })).toEqual([]);
  });

  it("does not allow a client to select a provider that is not eligible", () => {
    expect(findEligibleBuyerPaymentProvider(providers, "ipay", {
      buyerCountry: "FR", currency: "TND", amountMillimes: 12500,
    })).toBeNull();
    expect(findEligibleBuyerPaymentProvider(providers, "konnect", {
      buyerCountry: "TN", currency: "TND", amountMillimes: 12500,
    })?.id).toBe("konnect");
  });

  it("does not expose a provider without a confirmed payment method", () => {
    expect(eligibleBuyerPaymentProviders([{
      ...providers[0],
      methods: [],
    }], {
      buyerCountry: "TN", currency: "TND", amountMillimes: 12500,
    })).toEqual([]);
  });
  it("rejects providers whose method list contains only blank values", () => {
    expect(eligibleBuyerPaymentProviders([{
      ...providers[0],
      methods: [" ", "\\t"],
    }], {
      buyerCountry: "TN", currency: "TND", amountMillimes: 12500,
    })).toEqual([]);
  });

  it("normalizes whitespace and case in explicitly configured capabilities", () => {
    expect(eligibleBuyerPaymentProviders([{
      ...providers[0],
      supportedCountries: [" tn "],
      supportedCurrencies: [" tnd "],
    }], {
      buyerCountry: "TN", currency: "TND", amountMillimes: 12500,
    })).toHaveLength(1);
  });

  it("rejects non-safe integer amounts", () => {
    for (const amountMillimes of [-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(eligibleBuyerPaymentProviders(providers, {
        buyerCountry: "TN", currency: "TND", amountMillimes,
      })).toEqual([]);
    }
  });
});
