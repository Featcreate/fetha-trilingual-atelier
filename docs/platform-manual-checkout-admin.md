# Algorea Bazaar — approved centralized checkout and seller accounting

Status: approved product requirements; implementation must remain on `feat/platform-manual-checkout-admin` until separately approved for merge and deployment.

## Buyer checkout

- One unified cart may contain products from multiple active stores (maximum 50 distinct products).
- Checkout creates exactly one order with one unique order reference and immutable order-item snapshots. Each order item retains its own store and seller identity.
- The buyer pays the full cart total once to Algorea Bazaar, not to individual sellers.
- Supported launch methods: Flouci personal account, bank transfer, and postal transfer. Treat Flouci personal-account confirmation as manual; do not assume API, webhook, or automatic reconciliation support.
- The buyer-facing beneficiary label is exactly “Algorea Bazaar”. Do not expose the platform owner's personal name in buyer UI or transfer instructions. Show only the configured account identifier/details needed to transfer.
- Payment receiving details and enabled/disabled status for each method must be configurable by an authorized administrator without code changes.
- After order creation, show its unique reference and instructions for the selected method. Do not request a receipt or proof-of-payment upload.
- Orders remain pending and downloads remain locked until an administrator manually verifies receipt of the exact order amount and confirms payment.
- Admin confirmation must be transactional and idempotent: repeated confirmation cannot duplicate entitlements, seller ledger entries, commission entries, or collection records. Reject amount mismatch and non-pending orders safely.
- Once confirmed, unlock all eligible digital downloads for every item in the unified order.

## Seller accounting

- Platform commission is 10% (1000 basis points) for new sales, with historical order-item commission snapshots preserved.
- Calculate each seller/store's gross sales, discounts, commission, and net payable automatically from immutable order-item data.
- Maintain separate seller balances even when one buyer order includes several stores.
- Post accounting entries only after verified manual payment confirmation. Never accrue payable balances from pending or unverified orders.
- Preserve append-only, auditable accounting and unique idempotency keys for order-item ledger entries.

## Seller payout eligibility and review

- Minimum requestable payout balance is 50.000 TND (50,000 millimes) of net available seller proceeds after all actual, evidenced external fees recorded against that seller.
- Below 50.000 TND, payout creation/request must be rejected by the database, not merely hidden in the UI.
- Reaching 50.000 TND makes the seller eligible to submit a request; it does not trigger an automatic payout.
- Seller submits a request; the platform owner/admin manually reviews each seller's account and approves or rejects the request.
- Only an authorized admin may prepare/approve a payout batch and mark it paid after an actual manual bank transfer. Record transfer reference and timestamps.
- Keep the existing bank-transfer-only seller destination restriction unless separately changed by an explicit product decision.
- Payout batches must reserve their underlying ledger entries atomically so the same sale cannot be paid twice. Idempotency and immutable financial snapshots are mandatory.
- Unpaid balances below threshold remain in the seller's account and accumulate with later verified sales.

## Security and rollout

- Buyer payment instructions and receiving-account configuration are protected; only admins can change them.
- Only admins can confirm buyer payments, approve/reject seller payout requests, create payout batches, or mark transfers paid.
- Sellers may see only their own store's balances, requests, and payout history.
- No split payments, automatic seller transfers, or provider-initiated seller payouts.
- Do not deploy migrations to any Supabase environment, merge to `main`, or deploy Render as part of this branch work. Those actions require separate explicit approval.
- Do not reuse the old `direct_seller` payment model or its migration; it conflicts with centralized collection and the approved 10% commission.

## Implementation added on the isolated branch

- Added migration `0055_centralized_manual_platform_checkout.sql`: unique buyer-facing order references, three configurable platform collection methods, fixed buyer-facing beneficiary label, admin-only configuration, manual exact-amount confirmation, and service-role actor wrappers.
- The migration sets the active commission and the default for new orders to 10% (1000 basis points); historical order-item commission snapshots remain unchanged.
- Manual confirmation delegates to the existing transactional settlement function, which unlocks every order-item download and posts seller payable and platform commission ledger entries idempotently.
- Cart checkout now creates one multi-store order and displays the selected method's transfer instructions without requesting a receipt. The buyer sees only “Algorea Bazaar” as beneficiary.
- Seller payout requests are recorded separately. The database rejects requests below 50,000 millimes after subtracting all evidenced seller-borne external fees that have not already been allocated to a payout. Requests remain subject to manual admin review.
- Admin UI now includes payment-method configuration, exact-amount manual order confirmation, and seller payout-request review.
- The selected buyer payment method, account identifier, fixed beneficiary label, and instructions are snapshotted on the order so later admin edits cannot silently change existing payment instructions.
- An approved seller payout request is required before a payout batch can be created; creating the batch atomically marks that request fulfilled.
- Seller UI now exposes gross earned proceeds, actual external fees charged to the seller, net available balance after fees and prior payouts, the 50 TND threshold, request submission, and request status. All recorded external fees are charged to seller proceeds; none are absorbed by the platform.

## Verification status

- Branch-only GitHub commits were created; no database migration was applied to test or production.
- No merge to `main` and no Render deployment were performed.
- GitHub Actions completed dependency installation and migration-journal validation successfully, and TypeScript typecheck passed on the latest checked run.
- The formatting check failed on six changed TypeScript/TSX files; lint, tests, and production build were skipped as a result. This remains a blocking item before merge.
- Migration 0055 has not been executed against a database. Before merge, fix formatting, rerun the full CI pipeline, validate the migration against a disposable/test Supabase database, run Supabase security advisors, and exercise the multi-store checkout, manual confirmation, seller-fee, and payout-threshold acceptance tests.
