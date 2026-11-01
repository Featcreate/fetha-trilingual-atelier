# Algorea Bazaar — payment and settlement configuration

**Status:** Implemented as a safe configuration boundary; additional providers and live settlement routes are not enabled.

## Product and accounting invariants

- Marketplace order creation, pricing, commission calculation, seller balances, and payout records remain owned by Algorea Bazaar.
- The platform commission remains **5% by default (500 basis points)** and continues to use the existing database-controlled, order-snapshotted commission setting.
- External payment, bank transfer, receiving, and withdrawal fees remain separate from the platform commission and are assigned only under the approved fee-allocation policy.
- A provider or bank account is an integration choice, not the source of truth for marketplace balances.
- A provider callback or browser redirect is never sufficient proof of payment. The selected provider must be queried server-to-server and settlement must remain idempotent.
- No payment provider, bank account, currency, or payout method is assumed to be permanently selected.

## Current implementation

The server-side setting `PAYMENT_COLLECTION_PROVIDER` selects the current collection route:

| Value       | Behavior                                                                    |
| ----------- | --------------------------------------------------------------------------- |
| unset       | Preserves the current Konnect route for backward compatibility              |
| `konnect`  | Selects Konnect, subject to credentials and explicit sandbox/live switches |
| `disabled` | Blocks new Konnect checkout initiation                                      |
| any other   | Fails closed; no unimplemented provider can accidentally be selected         |

The selector is implemented in `src/lib/payment-activation.ts` and enforced by `src/lib/konnect.server.ts`. The existing explicit activation gates remain mandatory:

- Sandbox: `KONNECT_ENV=sandbox` (or unset) and `KONNECT_SANDBOX_PAYMENTS_ENABLED=true`.
- Live: `KONNECT_ENV=live` and `KONNECT_LIVE_PAYMENTS_ENABLED=true`.

Selecting `disabled` does not delete payment history or remove the ability to reconcile already-created Konnect payment references when credentials are available.

**Important:** Konnect is the only implemented collection adapter today. Setting another provider name does not create or enable that provider. A second provider must receive its own server-only adapter, verification rules, webhook endpoint, fee disclosure, currency handling, and tests before it can be selected.

## Settlement account flexibility

The platform's settlement destination is deliberately not hard-coded into marketplace business logic. When a bank or provider account is selected later, configure it through the provider's approved server-side credentials and a stable logical account key. Do not store full bank/card credentials, passwords, or sensitive account access tokens in ordinary application settings or client-visible database rows.

The future account configuration must support replacing the settlement destination without changing order, commission, seller-ledger, or payout calculations. The actual account type (bank account, eligible foreign-currency account, or provider wallet) remains undecided until the bank/provider confirms that it accepts this marketplace's collection and seller-funds flow.

A personal savings account is not assumed to be an eligible commercial collection or third-party-funds account.

## Seller balances and payouts

- The existing ledger remains the authoritative record of seller proceeds and platform commission.
- The default payout workflow remains **weekly manual transfers**.
- The existing payout records preserve the commission and seller-amount snapshots and prevent the same sale ledger entry from being paid twice.
- Direct provider payouts remain disabled unless the provider confirms the API, seller eligibility/linking, limits, currency, fees, and transfer-reference behavior in writing.
- Provider/bank settlement fees must not be silently deducted from the platform's 5% commission.

## Future provider-neutral database step

The current orders schema still contains Konnect-specific payment reference and checkout URL fields. Before a second provider is activated, add a reviewed, additive migration for provider-neutral payment attempts (provider identifier, provider reference, currency, amount, checkout URL, status, and idempotency key), preserve existing Konnect records, and update generated Supabase types and webhook/reconciliation paths. Do not apply that migration to any database as part of this configuration-only change.

A later admin-controlled settlement-account registry may store non-secret labels and account type/provider identifiers. Credentials remain in the hosting platform's secret manager. Switching the selected account must never rewrite historical ledger entries or payout snapshots.

## Explicitly not done

- No business registration or bank account opening is required for this development change.
- No bank account or provider credentials were requested, stored, or changed.
- No international provider was connected or represented as available.
- No database migration was applied.
- No live payment, automatic payout, production deployment, or paid service was enabled.
