export type SellerPaymentProvider = "konnect" | "ipay";

export interface SellerPaymentAccountRouting {
  sellerCountryCode: string;
  provider: SellerPaymentProvider;
  providerAccountRef: string | null;
  status: "not_started" | "pending" | "verified" | "rejected" | "suspended";
  referralCodeUsed: string | null;
}

export type PaymentRoutingResult =
  | { ok: true; provider: SellerPaymentProvider; providerAccountRef: string }
  | { ok: false; reason: "country_provider_mismatch" | "seller_account_not_verified" | "provider_account_missing" };

/**
 * Resolve only a verified seller-owned merchant account.
 * This is deliberately fail-closed; it does not create payment sessions.
 */
export function resolveSellerPaymentRouting(
  account: SellerPaymentAccountRouting,
): PaymentRoutingResult {
  const expectedProvider: SellerPaymentProvider =
    account.sellerCountryCode === "TN" ? "konnect" : "ipay";

  if (account.provider !== expectedProvider) {
    return { ok: false, reason: "country_provider_mismatch" };
  }
  if (account.status !== "verified") {
    return { ok: false, reason: "seller_account_not_verified" };
  }
  if (!account.providerAccountRef?.trim()) {
    return { ok: false, reason: "provider_account_missing" };
  }
  if (account.referralCodeUsed && expectedProvider !== "konnect") {
    return { ok: false, reason: "country_provider_mismatch" };
  }
  return {
    ok: true,
    provider: expectedProvider,
    providerAccountRef: account.providerAccountRef,
  };
}
