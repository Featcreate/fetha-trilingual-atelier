# Algorea Bazaar roadmap

## Completed on the feature branch (not yet merged or deployed)

- [x] Homepage shell, brand, French/Arabic/English language switching
- [x] Marketplace schema, seller/store/product relationships, private product files and secure downloads
- [x] Public searchable catalogue, product detail pages, public store pages and seller-uploaded product preview images
- [x] Seller workspace: free store creation, store profile name, product create/edit/publish/pause, multiple private file uploads
- [x] Seller order and earnings view (read-only order status and seller proceeds)
- [x] Buyer order history and secure downloads using the existing entitlement flow
- [x] Terms of Use acceptance at signup in Arabic, French and English; configurable platform commission set to 5% by default (migrations pending)
- [x] Expanded digital product types and seller-scoped order visibility (migrations pending)
- [x] Admin dashboard: configurable commission, store suspension/reactivation, product moderation, and order monitoring (no new migration)

## Remaining before a safe launch

- [ ] Run the latest CI after payment-gating, storage-limit and product-image changes; resolve any format, lint, test or build failures
- [ ] Apply migrations 0000–0014 in order to a disposable Supabase clone and verify migration compatibility, RLS, verified-email onboarding, 1 GiB store quota, 50 MiB private file limit, 10 MiB public image limit, image/file uploads, downloads, commission snapshots and payout workflows
- [x] Admin settings/moderation interface, including configurable commission, store/product oversight and order monitoring
- [x] Add French and English Terms of Use translations matching the Arabic version; obtain Tunisian legal review and complete operator identity/contact details before launch
- [ ] Add multi-currency support and confirm seller eligibility/payout coverage by country; current catalog and order accounting remain TND-only
- [ ] Build and test buyer cart/checkout, payment-return route and end-to-end order flow only after provider terms, fees and sandbox behavior are confirmed
- [ ] Verify the supplied Konnect referral route with Konnect/iPay, including attribution to the platform owner's account, Tunisian seller eligibility, seller-account identification/linking, manual transfer capability, settlement currency, limits, fees, and terms. Supplied Konnect code: `31XyM7MR8wy71ga7a`; registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a. This is the platform owner's Konnect referral, not an iPay-issued code.
- [ ] Configure transactional email and order notifications with a verified sender domain and tested delivery/retry handling

## Safety constraints

- Seller registration, store creation and listings remain free. Email verification is required before store creation. Each store has a 1 GiB total storage quota, a 50 MiB private-file cap, and a 10 MiB public product-image cap.
- Platform commission starts at 5% and remains administrator-configurable. Existing order commission snapshots are immutable.
- Tunisian seller payouts are planned as manual weekly transfers after the platform's commission, subject to confirmation of the Konnect referral registration route and iPay/Konnect account-linking and transfer process; seller-side iPay/bank fees remain the seller's responsibility.
- Digital products only; no shipping or physical inventory.
- Keep product files private; use short-lived signed downloads and preserve immutable order/file snapshots.
- No live payments, publishing, production migrations, paid services, or provider connections without explicit approval.
