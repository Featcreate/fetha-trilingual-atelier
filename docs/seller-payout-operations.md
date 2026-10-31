# Algorea Bazaar — seller payout operations

## Current supported route

Store creation and product listings remain free for sellers. No seller registration, store-opening, listing, or mandatory seller subscription fee is charged.

- Seller payout preference defaults to **weekly manual transfer**.
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
- The seller's amount is the full amount remaining after the platform commission. External provider/bank transfer fees are separate and must be disclosed to the party charged; they are not silently deducted from the platform commission.
- Live checkout, live payment collection, automatic payouts, and production deployment remain separate activation steps.

## Weekly operating procedure

1. In the administrator dashboard, select the seller's store and prepare a payout batch.
2. Review the seller amount and commission-rate snapshot against the seller ledger.
3. Transfer the displayed seller amount using the agreed external payment method.
4. After the transfer succeeds, record the transfer reference in the administrator dashboard and confirm the payout.
5. If the transfer fails, record the reason. Do not create another payout batch for the same sales.

## Database rollout

Apply migrations in order on a disposable Supabase clone first. Verify RLS, role checks, migration ordering, commission reconciliation, idempotency under concurrent requests, terminal payout states, and seller-only payout visibility before applying any migration to a production database.
