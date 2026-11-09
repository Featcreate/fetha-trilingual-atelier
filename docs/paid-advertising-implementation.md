# Paid advertising — implementation notes

## Approved commercial rules
- Three simultaneous active placements maximum.
- Launch prices: 7 days = 20 TND; 14 days = 35 TND; 30 days = 60 TND.
- Prices are initial and admin-adjustable in a later settings step.
- Each request contains an image, title, description, HTTPS destination URL, selected duration, and price snapshot.
- An advertisement is never public before payment is verified server-side and an administrator approves it.
- The display period starts only when the administrator activates the paid, approved request.
- Renewals require a new request and a new payment.
- Display a clear “Paid advertisement” label.

## Payment boundary
- Use the platform's existing iPay organisation account and existing iPay integration; do not create a second provider integration.
- Advertising payments must have a dedicated reference and payment intent, independent of product orders.
- Never treat a redirect, query parameter, or unverified webhook event as proof of payment.
- Do not mark a payment verified until the provider's authoritative transaction lookup and webhook authenticity contract are confirmed with Audasoft and tested in sandbox.
- Match provider reference, amount, TND currency, product code, and final cleared/settled status to the exact advertising request.
- Declared bank/postal transfers remain unverified until actual receipt is authoritatively confirmed.
- Do not enable live iPay checkout or write provider credentials in this branch.

## Accounting
- Record advertising income as a distinct `advertising_revenue` ledger entry, separate from product collections, commissions, seller payables, and seller payouts.
- Use an idempotency key and the provider transaction reference.
- Refunds/cancellations must be represented by separate append-only reversal entries; never mutate ledger history.
- Monthly and annual advertising reports must query only advertising revenue and its reversals.

## Safety and rollout
- Migration `0041_paid_advertising_foundation.sql` is a draft in this branch only. It has not been applied to Supabase.
- The schema grants no direct client write access to advertising requests or the financial ledger.
- Activation is serialized and guarded against exceeding three active ads.
- iPay account linking, secret configuration, live checkout, production migration, merge, and deployment are later steps requiring explicit approval.
