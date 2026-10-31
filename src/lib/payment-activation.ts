export type KonnectPaymentEnvironment = {
  KONNECT_ENV?: string;
  KONNECT_SANDBOX_PAYMENTS_ENABLED?: string;
  KONNECT_LIVE_PAYMENTS_ENABLED?: string;
};

/**
 * Fail-closed payment activation. Credentials alone must never activate checkout.
 * Sandbox and live activation use separate, explicit server-side switches.
 */
export function isKonnectPaymentEnabled(env: KonnectPaymentEnvironment): boolean {
  if (env.KONNECT_ENV === "live") return env.KONNECT_LIVE_PAYMENTS_ENABLED === "true";
  if (env.KONNECT_ENV === undefined || env.KONNECT_ENV === "sandbox") {
    return env.KONNECT_SANDBOX_PAYMENTS_ENABLED === "true";
  }
  return false;
}