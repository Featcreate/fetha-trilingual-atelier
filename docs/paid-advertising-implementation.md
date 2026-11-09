# Paid advertising — implementation status

## Commercial rules
- Three simultaneous active placements maximum.
- Initial launch prices: 7 days = 20 TND; 14 days = 35 TND; 30 days = 60 TND.
- Prices are stored in administrator-controlled package settings. Each submitted request snapshots its selected price and duration.
- Each request contains an image, title, description, HTTPS destination URL, selected duration, and price snapshot.
- An advertisement is never displayed before authoritative payment verification and administrator approval.
- The paid period starts when the administrator activates the paid, approved request.
- Renewal requires a new request and a new payment.
- Display a clear “Paid advertisement” label.

## Implemented in the draft branch
- Public advertiser request page at `/advertise`, including image upload and advertiser request history.
- Homepage placement for up to three active, verified advertisements.
- Admin dashboard queue, activation action, package-price controls, and advertising-revenue reporting.
- Private creative storage with scoped uploader/admin access; server-generated, time-limited signed URLs are used for display.
- Database guard serializes activation and enforces the three-active-ad maximum.
- Atomic administrator activation creates the distinct advertising-revenue ledger entry.

## iPay payment boundary — not yet enabled
- Advertising is designed to use the platform's existing iPay organisation account and existing server-only one-shot client; no separate provider account or second integration is intended.
- Advertising payments require a dedicated payment intent/reference independent of product orders.
- The current repository iPay client only creates one-shot payment links. An authoritative transaction lookup, webhook authenticity contract, and cleared-funds semantics have not yet been implemented or confirmed.
- Never treat a browser redirect, query parameter, submitted receipt, or unverified webhook event as proof of payment.
- Do not enable `IPAY_CHECKOUT_ENABLED` until Audasoft confirms the account's eligibility for advertising fees, the transaction lookup contract, webhook authenticity, amount unit, and final cleared-funds semantics.
- No live checkout is enabled in this branch.

## Accounting
- Advertising income is recorded as a distinct `advertising_revenue` ledger entry, separate from product collections, commissions, seller payables, and seller payouts.
- The admin activation function inserts the advertising revenue entry atomically with activation and uses an idempotency key.
- The ledger schema reserves a separate linked refund entry and enforces a full-amount reversal; an operational iPay refund workflow is not implemented yet and must be added only after the provider confirms its refund API.
- Reports aggregate advertising revenue and linked refunds separately from product sales.

## Safety and rollout
- Migration `0041_paid_advertising_foundation.sql` is a draft in this branch only. It has not been applied to Supabase.
- No iPay account credentials have been added or changed.
- Do not merge, deploy, or apply the migration until the PR checks pass and the payment verification workflow is completed and reviewed.
