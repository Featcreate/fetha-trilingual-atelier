# Checkout and digital delivery integration

## Current checkout path

1. The buyer adds products to the cart and opens `/checkout`.
2. The checkout server function recalculates product prices and creates one idempotent order using the checkout key.
3. Konnect is currently the only buyer-payment provider connected to this path. The buyer is redirected to Konnect's hosted payment page.
4. The return page and payment webhook do not independently unlock a purchase. The server checks the transaction with Konnect and validates the order reference, TND currency, amount in millimes, and final paid state before calling the trusted settlement function.
5. The settlement function is idempotent. On verified payment it marks the order paid, creates the original-file entitlement for seven days, and posts the seller ledger entries.
6. The ZIP entitlement migration creates a separate ZIP entitlement for each purchased file. Original and ZIP downloads have independent one-success quotas.
7. The buyer sees both download actions in `/orders`. The authenticated same-origin download endpoint verifies the user's JWT, reserves the matching entitlement, streams from the private `product-files` bucket, and finalizes the quota only after the response stream reaches EOF. Cancellation or stream/finalization errors release the reservation.

## Provider availability

- Konnect: connected to order creation and authoritative server-side payment verification. Actual payment methods are presented by Konnect's hosted page; the storefront no longer presents mock selectable methods.
- iPay: not enabled for buyer checkout. The public iPay developer page documents JWT authentication, `X-Org-Id`, `GET /api/admin/transactions`, and webhook event names, but the full transaction schema and final-settlement semantics are only available in the authenticated merchant dashboard. A verified server-side lookup must be implemented and tested before iPay can be offered.
- Other providers: may be added through a provider adapter only after their checkout, transaction lookup, settlement, currency, amount precision, and refund semantics are verified.

## Migrations and deployment

The new delivery migrations are numbered `0041` through `0043` because `main` already contains migration `0040`. They have not been applied to Supabase. This PR does not change `main`, Render configuration, Supabase production state, payment activation flags, or provider credentials.

## Validation boundary

CI checks migration-journal consistency, TypeScript, formatting, lint, unit tests, and the production build. These checks do not constitute a Konnect Sandbox transaction, a Supabase database integration test, or a real browser download test. Those require a disposable Supabase environment with the migrations applied, a real private test file, and provider Sandbox credentials. Do not activate live checkout until those checks pass.
