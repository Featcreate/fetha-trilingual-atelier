export type PaymentActivationEnvironment = {
  PAYMENT_COLLECTION_PROVIDER?: string;
  KONNECT_ENV?: string;
  KONNECT_SANDBOX_PAYMENTS_ENABLED?: string;
  KONNECT_LIVE_PAYMENTS_ENABLED?: string;
};

export type CollectionProvider = "konnect" | "disabled";

/**
 * Selects the collection provider without coupling marketplace accounting to it.
 * The omitted value preserves the existing Konnect configuration.
 * Unknown values fail closed until an adapter is implemented and explicitly enabled.
 */
export function selectedCollectionProvider(
  env: Pick<PaymentActivationEnvironment, "PAYMENT_COLLECTION_PROVIDER">,
): CollectionProvider | null {
  const provider = env.PAYMENT_COLLECTION_PROVIDER;
  if (provider === undefined || provider === "konnect") return "konnect";
  if (provider === "disabled") return "disabled";
  return null;
}

/**
 * Fail-closed payment activation. Credentials alone must never activate checkout.
 * Sandbox and live activation use separate, explicit server-side switches.
 */
export function isKonnectPaymentEnabled(env: PaymentActivationEnvironment): boolean {
  if (selectedCollectionProvider(env) !== "konnect") return false;
  if (env.KONNECT_ENV === "live") return env.KONNECT_LIVE_PAYMENTS_ENABLED === "true";
  if (env.KONNECT_ENV === undefined || env.KONNECT_ENV === "sandbox") {
    return env.KONNECT_SANDBOX_PAYMENTS_ENABLED === "true";
  }
  return false;
}
