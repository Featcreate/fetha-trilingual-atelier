# Algorea Bazaar — seller payout operations

## Current supported route

Store creation and product listings remain free for sellers. No seller registration, store-opening, listing, or mandatory seller subscription fee is charged.

- Seller payout preference defaults to **weekly manual transfer**.
- All sellers, regardless of nationality or residence, are shown the same platform Konnect referral-registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a
- Algorea Bazaar applies no country-based seller-registration restriction. Konnect alone decides whether an applicant can register and what identity, phone, bank, residence, or other checks are required. The referral link does not guarantee acceptance or link a wallet automatically.
- Do not block store creation or product listings because a seller has not registered with Konnect. Do not promise or process a payout through Konnect unless the seller's account and payout route are accepted and verified by the provider.
- The platform commission is taken from each paid order item before the seller amount is recorded. The configured commission rate is snapshotted on each order item; the payout batch preserves those original amounts.
- Seller payout batches are created by an administrator from verified, paid sales that have not already been assigned to a payout.
- A batch is grouped by store and commission rate so that historical commission snapshots are never recalculated.
- Every batch has a unique idempotency key. Every sale ledger entry and order item can belong to at most one payout batch.
- An administrator records a transfer as paid only after the real transfer has been completed and its external transfer reference is available.
- Failed transfers remain recorded and are not silently returned to the unpaid ledger. An administrator can retry the same payout after resolving the failure.
- Sellers can view their payout history and recorded transfer references.

## Important limits

- The admin confirmation action is an accounting record only. It **does not send money** or call a payment provider.
- Direct Konnect wallet payouts remain disabled by default. Do not enable them until Konnect confirms in writing that the API supports transfers to individual seller wallets, with the required seller account linking, eligibility, limits, currency, fees, and transfer references.
- No iPay or Konnect API credentials are required for weekly manual payout recording.
- At the default 5% commission rate, the seller's entitlement is 95% of the commissionable sale amount (after applicable discounts), before seller-side receiving, transfer, or withdrawal fees. The applicable rate is snapshotted per order item.
- The buyer is responsible for payment-method fees charged by the selected provider, subject to provider terms and applicable law. The provider itself calculates, displays, and collects those fees; Algorea Bazaar does not duplicate them in its checkout.
- Seller receiving, transfer, and withdrawal fees are the seller's responsibility and are calculated, displayed, and collected by the relevant provider. Algorea Bazaar does not itemize or manage those fees in the seller dashboard or payout interface.
- Algorea Bazaar must never pay, reimburse, absorb, or book any external payment, bank, transfer, or withdrawal fee as a platform expense. No such fee may reduce the platform commission. If a provider charges the platform account and no lawful, transparent allocation is available, keep that method disabled.
- Live checkout, live payment collection, automatic payouts, and production deployment remain separate activation steps.

## Payment activation safety

Konnect credentials alone do not enable checkout. Server-side activation is fail-closed and requires one explicit environment switch for the selected mode:

- Sandbox: set `KONNECT_ENV=sandbox` (or leave it unset) and `KONNECT_SANDBOX_PAYMENTS_ENABLED=true`.
- Live: set `KONNECT_ENV=live` and `KONNECT_LIVE_PAYMENTS_ENABLED=true`.
- Unknown environment values are rejected. Keep the live switch unset until provider, legal, provider-owned fee presentation, sandbox, and explicit live-launch checks are complete.
- When activation is off, checkout returns `payments_not_configured` before creating an order, preventing orphaned pending orders.
- Status verification for already-created Konnect payment references remains available when credentials are present, even if new checkout initiation is paused; this prevents a temporary kill switch from blocking reconciliation of payments already in flight.

## Weekly operating procedure

1. In the administrator dashboard, select the seller's store and prepare a payout batch.
2. Review the seller amount and commission-rate snapshot against the seller ledger.
3. Transfer the displayed seller amount using the agreed external payment method.
4. After the transfer succeeds, record the transfer reference in the administrator dashboard and confirm the payout.
5. If the transfer fails, record the reason. Do not create another payout batch for the same sales.

## Database rollout

Apply migrations in order on a disposable Supabase clone first. Verify RLS, role checks, migration ordering, commission reconciliation, idempotency under concurrent requests, terminal payout states, and seller-only payout visibility before applying any migration to a production database.
