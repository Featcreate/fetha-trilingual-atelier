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
- [x] Added migration `0022_platform_central_financial_ledger.sql` for append-only platform accounting entries and immutable buyer-currency/FX snapshots (GitHub only; not applied to Supabase)

## Remaining before a safe launch

- [ ] Complete all 16 seller/buyer categories after explicit approval to expand the current database category constraint (currently 10 allowed values).
- [ ] Run CI after the latest changes; resolve any format, lint, test or build failures.
- [ ] Apply migrations 0000–0022 in order to a disposable Supabase clone and verify migration compatibility, RLS, verified-email onboarding, storage quotas, uploads, downloads, commission snapshots, payout workflows, ledger immutability, and accounting reconciliation.
- [ ] Build and test buyer cart/checkout, payment-return route and end-to-end order flow only after provider terms, fees, currency support, and sandbox behavior are confirmed.
- [ ] Select a provider that confirms worldwide buyer coverage, digital multi-vendor collection for the platform's own merchant account, foreign-currency charge support where required, settlement behavior, fees, refunds/chargebacks, and reliable API/webhook verification.
- [ ] Implement the approved provider adapter and checkout FX quote flow; do not use informational display rates for real charges or accounting.
- [ ] Configure transactional email and order notifications with a verified sender domain and tested delivery/retry handling.
- [ ] Complete legal review and operator identity/contact details before public launch.

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
