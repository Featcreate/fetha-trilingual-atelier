# Algorea Bazaar roadmap

## Completed on the feature branch (not yet merged or deployed)

- [x] Homepage shell, brand, French/Arabic/English language switching
- [x] Marketplace schema, seller/store/product relationships, private product files and secure downloads
- [x] Public searchable catalogue, product detail pages and public store pages
- [x] Seller workspace: free store creation, store profile name, product create/edit/publish/pause, multiple private file uploads
- [x] Seller order and earnings view (read-only order status and seller proceeds)
- [x] Buyer order history and secure downloads using the existing entitlement flow
- [x] Terms of Use acceptance at signup and configurable platform commission (migration pending)
- [x] Expanded digital product types and seller-scoped order visibility (migrations pending)
- [x] Admin dashboard: configurable commission, store suspension/reactivation, product moderation, and order monitoring (no new migration)

## Remaining before a safe launch

- [ ] Run lint, unit tests and production build; fix all reported issues
- [ ] Apply migrations 0006–0008 to a disposable Supabase clone and verify RLS, store/product creation, uploads, seller order reads, buyer entitlements and commission fail-closed behavior
- [ ] Build an admin settings/moderation interface, including commission configuration and store/product oversight
- [ ] Add complete French and English legal translations and obtain Tunisian legal review; complete operator identity/contact details
- [ ] Add multi-currency support and confirm seller eligibility/payout coverage by country
- [ ] Add cart/checkout only after provider terms, fees and sandbox behavior are confirmed
- [ ] Select and verify the payment/payout provider; live activation requires separate explicit approval
- [ ] Configure transactional email and order notifications

## Safety constraints

- Seller registration, store creation and listings remain free.
- Digital products only; no shipping or physical inventory.
- Keep product files private; use short-lived signed downloads and preserve immutable order/file snapshots.
- No live payments, publishing, production migrations, paid services, or provider connections without explicit approval.
