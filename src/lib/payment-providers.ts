/**
 * Shared buyer-checkout provider contract.
 *
 * Provider adapters own their credentials, hosted-checkout creation and authoritative
 * status lookup. The marketplace owns order pricing, settlement, ledger posting,
 * entitlements and seller payables. Adding a provider must not duplicate those flows.
 */
export type BuyerPaymentProviderId = "konnect" | "ipay" | (string & {});

export type BuyerCheckoutContext = {
  buyerCountry: string;
  currency: string;
  amountMillimes: number;
};

export type BuyerPaymentProviderOption = {
  id: BuyerPaymentProviderId;
  label: string;
  enabled: boolean;
  supportedCountries: readonly string[];
  supportedCurrencies: readonly string[];
  /** Payment methods actually confirmed and enabled for this merchant account. */
  methods: readonly string[];
};

export type BuyerPaymentProviderAdapter = {
  id: BuyerPaymentProviderId;
  createCheckout(input: {
    orderId: string;
    amountMillimes: number;
    currency: "TND";
    successUrl: string;
    failureUrl: string;
    webhookUrl: string;
  }): Promise<{ checkoutUrl: string; providerReference: string }>;
  verifyPayment(input: {
    orderId: string;
    providerReference: string;
    expectedAmountMillimes: number;
    currency: "TND";
  }): Promise<
    | {
        providerId: BuyerPaymentProviderId;
        status: "paid";
        orderId: string;
        amountMillimes: number;
        currency: "TND";
        providerReference: string;
      }
    | {
        providerId: BuyerPaymentProviderId;
        status: "pending" | "failed" | "mismatch";
        orderId: string;
        providerReference: string;
      }
  >;
};

/**
 * Return only options that are enabled and explicitly support the buyer's country
 * and canonical checkout currency. Empty capability lists fail closed.
 */
export function eligibleBuyerPaymentProviders(
  providers: readonly BuyerPaymentProviderOption[],
  context: BuyerCheckoutContext,
): BuyerPaymentProviderOption[] {
  const country = context.buyerCountry.trim().toUpperCase();
  const currency = context.currency.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(country) || currency !== "TND") return [];
  if (!Number.isSafeInteger(context.amountMillimes) || context.amountMillimes <= 0) return [];

  return providers.filter((provider) => {
    if (
      !provider.enabled ||
      !provider.methods.some((method) => method.trim().length > 0)
    ) {
      return false;
    }

    return (
      provider.supportedCountries.some(
        (value) => value.trim().toUpperCase() === country,
      ) &&
      provider.supportedCurrencies.some(
        (value) => value.trim().toUpperCase() === currency,
      )
    );
  });
}

export function findEligibleBuyerPaymentProvider(
  providers: readonly BuyerPaymentProviderOption[],
  providerId: string,
  context: BuyerCheckoutContext,
): BuyerPaymentProviderOption | null {
  return (
    eligibleBuyerPaymentProviders(providers, context).find(
      (provider) => provider.id === providerId,
    ) ?? null
  );
}
