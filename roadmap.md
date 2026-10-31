# Algorea Bazaar roadmap

## Completed on the feature branch (not yet merged or deployed)

- [x] Homepage shell, brand, French/Arabic/English language switching
- [x] Marketplace schema, seller/store/product relationships, private product files and secure downloads
- [x] Public searchable catalogue, product detail pages and public store pages
- [x] Seller workspace: free store creation, store profile name, product create/edit/publish/pause, multiple private file uploads
- [x] Seller order and earnings view (read-only order status and seller proceeds)
- [x] Buyer order history and secure downloads using the existing entitlement flow
- [x] Terms of Use acceptance at signup in Arabic, French and English; configurable platform commission set to 5% by default (migrations pending)
- [x] Expanded digital product types and seller-scoped order visibility (migrations pending)
- [x] Admin dashboard: configurable commission, store suspension/reactivation, product moderation, and order monitoring (no new migration)

## Remaining before a safe launch

- [ ] Run lint, unit tests and production build; fix all reported issues
- [ ] Apply migrations 0006–0009 to a disposable Supabase clone and verify RLS, verified-email seller onboarding, 1 GiB storage quota, store/product creation, uploads, seller order reads, buyer entitlements and commission snapshots
- [x] Admin settings/moderation interface, including configurable commission, store/product oversight and order monitoring
- [x] Add French and English Terms of Use translations matching the Arabic version; obtain Tunisian legal review and complete operator identity/contact details before launch
- [ ] Add multi-currency support and confirm seller eligibility/payout coverage by country; current catalog and order accounting remain TND-only
- [ ] Add cart/checkout only after provider terms, fees and sandbox behavior are confirmed
- [ ] Confirm iPay's official registration process for Tunisian sellers, the supported seller-account identification/linking mechanism, manual transfer capability, settlement currency, limits, fees, and terms. iPay has no referral code/program for this purpose; no referral code is required or should be invented.
- [ ] Configure transactional email and order notifications

## Safety constraints

- Seller registration, store creation and listings remain free. Email verification is required before store creation. Each store has a 1 GiB total storage quota and a 50 MiB per-file cap.
- Platform commission starts at 5% and remains administrator-configurable. Existing order commission snapshots are immutable.
- Tunisian seller payouts are planned as manual weekly transfers after the platform's commission, subject to confirmation of iPay's official account-linking and transfer process; seller-side iPay/bank fees remain the seller's responsibility.
- Digital products only; no shipping or physical inventory.
- Keep product files private; use short-lived signed downloads and preserve immutable order/file snapshots.
- No live payments, publishing, production migrations, paid services, or provider connections without explicit approval.
