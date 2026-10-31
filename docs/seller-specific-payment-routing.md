# Seller-specific payment routing

## Approved business rule

- Sellers whose verified business country is Tunisia (`TN`) use **Konnect**.
- The platform's Konnect referral code is used only in the Tunisian seller onboarding flow.
- Sellers outside Tunisia use **iPay** and must connect their own merchant account. No platform referral code is used for iPay.
- The buyer's payment is intended to go directly to the selected seller's provider account.
- Algorea Bazaar's commission is 5% (500 bps). Provider fees remain separate and are disclosed to the party charged.
- Live payments remain disabled. This change is a data-model foundation, not a production payment activation.

## What this branch adds

- A private `seller_payment_accounts` mapping with country/provider consistency checks, external merchant account reference, onboarding status, and a Tunisian-only referral field.
- Generic provider fields on orders and payment events while retaining legacy `konnect_*` fields for compatibility.
- Server-only writes for seller payment account verification. API secrets must remain in server environment secrets, never in this table or client code.

## Mandatory blockers before enabling checkout

1. **Confirm the exact iPay product and merchant model.** The public iPay.tn website advertises marketplace, multi-seller and split-payment capabilities, but its public developer page exposes only the high-level REST/JWT and webhook overview. The full API contract is behind the authenticated dashboard. We must confirm whether each seller can own/connect an independent merchant account and whether the marketplace can initiate a charge on behalf of that seller. Marketing claims alone are not an API contract.
2. **Confirm Konnect referral semantics.** A referral code may be attribution only; it must not be assumed to provision a seller wallet or authorize receiverWalletId routing. Each Tunisian seller's merchant wallet/account must be verified before use.
3. **Define mixed-seller carts.** The existing order model creates one payment for an order that may contain products from multiple stores. Direct-to-seller settlement requires either a provider-supported marketplace split across all sellers in that order or separate provider payment sessions/suborders. Checkout must reject unsupported mixed-provider carts until this is implemented and tested.
4. **Implement provider adapters independently.** Each adapter must create checkout against the verified seller account, verify callbacks server-to-server, validate amount/currency/order/seller/account, enforce idempotency, and record provider events.
5. **Reconcile accounting.** Confirm whether the 5% platform commission is deducted by the provider at source or collected separately. Do not assume that the existing seller ledger equals a provider payout statement.
6. **Test only in sandbox/test accounts first.** No live keys, live wallet IDs, or production database migrations are part of this branch.

## Current safety state

- This branch does not enable live payments.
- No API keys, wallet IDs, referral secrets, or seller account identifiers are embedded in source.
- The existing Konnect checkout path has not been silently redirected to the platform or to a guessed seller wallet.
- Do not apply the migration to Supabase until the migration sequence and the provider onboarding contract have been reviewed.
