# Algorea Bazaar roadmap

## Completed on the feature branch

- [x] Homepage shell, brand, French/Arabic/English language switching
- [x] Marketplace schema, seller/store/product relationships, private product files and secure downloads
- [x] Public searchable catalogue, product detail pages, public store pages and seller-uploaded product preview images
- [x] Seller workspace: free store creation, store profile name, product create/edit/publish/pause, multiple private file uploads
- [x] Seller order and earnings view (read-only order status and seller proceeds)
- [x] Buyer order history and secure downloads using the existing entitlement flow
- [x] Terms of Use acceptance at signup in Arabic, French and English; configurable platform commission set to 5% by default
- [x] Expanded digital product types and seller-scoped order visibility
- [x] Admin dashboard: configurable commission, store/product moderation, and order monitoring
- [x] Added and applied migration `0022_platform_central_financial_ledger.sql` to the original Supabase project; verified RLS, constraints, triggers and append-only behavior

## Remaining before a safe launch

- [x] Apply migration 0022 to the original Supabase project after a successful transaction-wrapped dry run against its actual schema; verify migration history, ledger RLS, constraints, indexes, triggers, append-only behavior, and payout guards.
- [x] Regenerate and commit Supabase TypeScript types after migration 0022.
- [x] Prepare the current Konnect international-card route: hosted API checkout, server-to-server payment verification, bank_card prioritized, TND canonical charge, local methods retained, fail-closed activation.
- [ ] Obtain written Konnect approval for worldwide international-card acceptance for this exact digital multi-vendor marketplace, with the platform as sole collection beneficiary and no seller splits/payouts.
- [ ] Confirm provider fee allocation, buyer-paid fee behavior, settlement timing/currency, reserves, refunds/chargebacks, and API/webhook reconciliation in sandbox.
- [ ] Keep current checkout TND-only until a foreign-currency quote/settlement flow is proven. Do not use informational display rates as payment quotes or accounting evidence.
- [ ] Run CI, lint, tests and production build after the SQL and checkout changes are finalized.

## Financial operating model

- Worldwide buyers may purchase subject to provider and legal coverage.
- Phase 1 seller onboarding is limited to Tunisia; global buyer access does not imply global seller payout support.
- The payment provider collects buyer payments for Algorea Bazaar and settles them to the platform's own merchant/settlement account. The provider never splits or distributes seller proceeds.
- The platform's internal financial system is the sole source of truth for collections, settlement, FX snapshots, commission, seller payable balances, and payout records.
- Canonical seller accounting and Phase 1 seller payouts are in TND. Foreign buyer charge amounts and the actual platform settlement are stored separately with immutable FX metadata.
- Platform commission starts at 5% and remains administrator-configurable. Existing order commission snapshots are immutable.
- Seller payouts are initiated only by Algorea Bazaar, weekly by default and manually. Provider APIs do not initiate seller payouts.
- Digital products only; no shipping or physical inventory. Seller registration, store creation and listings remain free.
- Keep product files private; use short-lived signed downloads and preserve immutable order/file snapshots.

## Activation and deployment constraints

- No live payments, provider connections, production migrations, publishing, or paid services without explicit approval.
- Migration 0022 is a schema addition only. It has not been applied to Supabase and does not activate checkout or move funds.
