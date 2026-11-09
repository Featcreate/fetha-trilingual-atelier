# Paid advertising — iPay collection design

## Approved product rules

- Paid placements are a separate platform revenue stream; they are not product sales, seller commission, or seller payable.
- At most three advertisements may be active at once.
- Launch prices (administrator-configurable): 7 days = 20 TND, 14 days = 35 TND, 30 days = 60 TND.
- Each request stores an immutable price and duration snapshot.
- Advertiser submits image, title, description, and destination URL.
- An advertisement is not displayed until payment is authoritatively confirmed and an administrator approves its content.
- The paid period starts when the advertisement becomes active, not when the request is created.
- Renewal requires a new request and payment.
- Arabic, French, and English UI.
- Advertising receipts/refunds/cancellations are recorded separately in the platform financial ledger.

## Collection provider

Use the platform's existing iPay organisation account and the existing server-only one-shot client in `src/lib/ipay.server.ts`. Do not use Konnect for advertising checkout. Do not create another provider account or expose provider credentials to the browser.

## Required transaction lifecycle

1. Authenticated advertiser creates a request using a server-selected package price.
2. Server creates a unique advertising request reference and iPay one-shot transaction for the exact TND amount.
3. Advertiser is redirected to the hosted iPay payment URL.
4. The server verifies the transaction using an authoritative iPay transaction lookup and validates transaction ID, external reference, product code, exact amount, currency, and final cleared/paid state.
5. Only after verified payment does the request become paid-awaiting-review.
6. Admin approves or rejects the creative. Approval activates it only if a placement slot is available.
7. Enforce the three-active-ad limit atomically in the database; never rely on a client-side count.
8. On activation, set the start/end timestamps and record an idempotent advertising-revenue entry in the central ledger. Refunds and cancellations use separate, linked ledger entries.

## Safety gate — do not activate live advertising checkout yet

The repository's current iPay integration is only a server-side one-shot request builder. The documented readiness note says no iPay webhook handler, authoritative transaction reconciliation path, or webhook-authenticity verification has been implemented. Public iPay material also leaves unresolved whether a `transaction.completed` event for declared bank/postal transfers represents cleared funds or merely a customer declaration.

Therefore:
- Keep `IPAY_CHECKOUT_ENABLED` disabled.
- Do not mark an advertising request paid from a browser redirect or unverified webhook.
- Do not activate or display an ad based only on a submitted receipt or event name.
- Do not apply any database migration to the live Supabase project as part of this preparation.
- Obtain iPay's written confirmation of the authoritative transaction lookup, webhook authenticity, amount unit, and cleared-funds semantics before implementing the settlement/activation path.

## Existing accounting integration

The central ledger table is `public.platform_financial_ledger_entries`. Its current `entry_type` check constraint does not yet include an advertising-revenue type. A future additive migration must add a dedicated type (for example `advertising_revenue`) and preserve the ledger's idempotency, append-only, admin-only read boundary, and TND millime accounting. Advertising entries must not carry order, seller, store, or seller-payout references.

## Package pricing (TND)

| Duration | Launch price |
| --- | ---: |
| 7 days | 20.000 |
| 14 days | 35.000 |
| 30 days | 60.000 |

These are initial launch prices, not hard-coded permanent prices; administrators should be able to change future package prices without altering existing requests.
