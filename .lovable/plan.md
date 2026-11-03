# Algorea Bazaar — Phase 1 audit (no changes made)

## 1. What exists and works

- One page only: the homepage (sticky header, mobile menu, hero, 2 static image previews, footer), FR default / AR right-to-left with Tajawal / EN, language remembered in the browser. Logo is still an empty marked slot (no logo file in place).
- Backend (Lovable Cloud) is ON with real tables: `user_roles`, `profiles`, `products`, `product_files`, `orders`, `order_items`, `payment_events`, plus 2 private storage buckets (`product-images`, `product-files`). Email/password + Google sign-in enabled.
- Data: 0 products, 0 orders, 0 admins.
- No sign-in, account, cart, product, checkout or admin pages exist. Nothing backend-related is reachable from the UI.
- 7 automated tests (payment decision rules, money conversion) — pure logic, no live Konnect.

## 2. Conflicts with the phased plan

- Konnect payment code already exists (payment start, status check, webhook at `/api/public/konnect/webhook`, admin recheck). It is dormant (no credentials -> returns "not configured"), but it contradicts "payment deferred to final phase". Recommend: leave untouched and unused until the final phase; do not delete yet.
- Schema is single-vendor: `products` has no seller/vendor owner, `orders` assumes one shop, no vendor role, no payouts/commission. A marketplace needs additive changes (vendor table, `vendor_id` on products, per-vendor order lines). Design it so one default vendor = single-store mode.
- `create_order` function prices orders but is tied to the current single-vendor shape.
- Old name remains in a stored language key (`fethacreate.lang`) — renaming it resets visitors' saved language once (harmless, there are no real users yet).

## 3. Safest order, with pause points

1. Brand identity (logo + name + metadata). PAUSE for review.
2. Accounts: sign up / in / out, profile page. PAUSE.
3. Vendor model (additive schema: vendors, vendor role, `vendor_id`, single-vendor fallback flag). PAUSE.
4. Catalog: public product list + detail pages, vendor/admin product management with private files. PAUSE.
5. Cart + server-priced order creation (no payment). PAUSE.
6. Customer orders/library; admin order view. PAUSE.
7. Emails (needs email domain). PAUSE.
8. Final: choose payment/payout provider, adapt or retire Konnect code, sandbox tests, then live only on explicit approval.

## 4. Financial fee allocation policy — updated 2026-11-03

- Algorea Bazaar's platform commission is 5% by default and administrator-configurable, calculated separately from all external payment, transfer, and withdrawal fees. The 5% rate is captured in each order item as an immutable snapshot.
- The seller bears all verified external fees attributable to the sale: payment processing/collection, currency conversion, settlement, transfer, receipt and withdrawal. These fees remain separate from the 5% commission and are itemized and deducted from seller proceeds only once, using actual charges and a documented allocation method. Weekly seller payouts remain manual.
- Algorea Bazaar must not absorb, reimburse, or record any provider, bank, transfer, or withdrawal fee as a platform expense. Such fees must never reduce the platform commission.
- External fees must be separately identified, accurately calculated from actual provider/bank evidence, and disclosed in the seller statement. No hidden fees and no guessed or hard-coded fee schedule. Do not add a separate external fee to the buyer's checkout under this allocation rule.
- If a provider charges the platform account and its fee cannot lawfully and transparently be assigned to the responsible buyer or seller, do not activate that payment/payout method until the commercial and technical arrangement is resolved.
- Do not assume iPay's quoted rate or cap, any referral program, or any other provider's pricing without current written confirmation. We have confirmed that the referral code is not issued by iPay itself. The platform owner's Konnect referral code and link have been supplied. Offer the same Konnect registration link to every seller regardless of nationality, country, or residence; do not route sellers by country or use iPay as an automatic foreign-seller fallback. Konnect alone decides seller eligibility and verification requirements. Confirm referral attribution, account-linking, and manual transfer procedures before enabling payouts.
- This policy is a product requirement, not permission to activate live payments. Provider selection, fee mechanics, sandbox verification, and explicit approval remain prerequisites.

## 5. Risks

- Design: new pages must reuse the existing color tokens and fonts; the header/footer live inside the homepage file, so extracting them for other pages must be done without visual change.
- Logo: the supplied logo has a dark background; on the cream header it will show as a dark disc — acceptable, but check contrast.
- Security: public webhook route exists (verifies with Konnect before any change — safe, but dormant). Product images bucket is private, so the storefront will need signed or public-read image access later. No admin assigned yet; first admin must be granted manually via the backend, never from the browser.
- Data: schema changes must stay additive (no drops/renames).

## 6. Files for the brand milestone (not changed now)

- `public/brand/` — add the new logo file (e.g. `algorea-bazaar-logo.jpg`)
- `src/components/BrandLogo.tsx` — logo path, alt text "Algorea Bazaar", remove slot
- `src/lib/i18n.ts` — hero texts FR/AR/EN, logo-slot label, storage key
- `src/routes/index.tsx` — title, description, og tags, footer copyright
- `src/routes/__root.tsx` — default title/description
- `src/styles.css` — comment only
- `src/lib/shop.functions.ts` — payment description label (optional; payment code otherwise untouched)

## 7. Legal terms and configurable commission

- The Terms of Use page is available in Arabic, French and English under version `2026-10-31-v2`. These are working translations, not a legal opinion or legally reviewed/published terms.
- Before launch, complete the operator's legal identity/contact details and obtain Tunisian legal review of all three language versions.
- Implemented in branch `configurable-commission-and-terms-consent`: signup requires an unchecked consent checkbox, and a database trigger validates the accepted terms version/language and records the user ID, version, server timestamp, and language in an append-only table. The current signup flow records initial acceptance; prompting existing users to re-accept after a material revision remains a future task.
- Implemented in branch `configurable-commission-and-terms-consent`: commission starts at 500 bps (5%), is NOT NULL, and can be changed by an authorized admin through the dashboard. New order items snapshot the rate; existing snapshots are preserved. The admin settings UI and seller-facing disclosure are present.

## 8. Confirmations

- Yes, real database work exists: 3 applied migrations, 7 tables, security policies, 2 private buckets — the empty `drizzle/schema.ts` is normal (migrations are SQL files).
- Yes, Konnect payment logic exists in code but is inactive (no credentials, no UI calls it, no transactions ever made).

## 9. Current implementation branch — 2026-10-31

- Branch: `configurable-commission-and-terms-consent` (based on the documentation review branch).
- Added migration `0006_configurable_commission_and_terms_acceptance.sql`; it has not been applied to Supabase.
- Added a Terms of Use page at `/terms` in Arabic, French and English, plus an explicit signup checkbox in all three languages. The same version identifier is recorded for all language choices; legal review and operator identity details remain launch blockers.
- Signup acceptance is validated by a database trigger and recorded with a server-generated timestamp. The database migration has not been run, so this behavior is not active in the deployed Supabase project.
- Commission defaults to 5% and can be changed by an authorized administrator in `/admin`. The database migration enforces a non-null commission, and new orders snapshot the rate.
- Migration 0009 adds server-side verified-email enforcement for store creation and a 1 GiB per-store storage quota, in addition to the 50 MiB per-file database cap. It has not been applied to any database.
- Terms of Use are available in Arabic, French and English under the same version identifier.
- CI has read-only repository permissions and no longer commits or pushes formatting changes.
- No live payment provider, deployment, or production database was changed. The referral code will come from the platform owner's Konnect account, not from iPay. The platform owner has supplied the Konnect referral code `31XyM7MR8wy71ga7a` and registration link https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a. Verify that this exact link correctly routes and attributes seller registrations to the platform owner's Konnect account, without applying a platform-side country restriction. Confirm seller account identification/linking, manual transfer support, fees, and terms before enabling payouts. Multi-currency pricing and international payout execution remain unimplemented and blocked on provider capability, legal review, and verification. This does not justify restricting seller registration by country; Konnect alone determines account eligibility.

## 10. Marketplace interface implementation — 2026-10-31

The following UI work is now present on `configurable-commission-and-terms-consent`:

- Public searchable catalogue at `/catalog`, product detail pages at `/products/:id`, and public store pages at `/stores/:slug`.
- Seller workspace at `/seller`: free store creation, store-name editing, product creation/editing, publish/pause controls, multiple private product-file uploads, and seller order/earnings views.
- Buyer order history at `/orders` with the existing secure download orchestration and entitlement limits.
- Homepage navigation now points to the catalogue and seller workspace. Removed the previous static product preview images; the homepage uses product-type categories instead.
- Expanded product types (PDF, educational resources, bundles, apps, worksheets, flashcards, and the existing types) through additive migration `0008`.
- Added seller-scoped read access to the seller's own order lines and order status through additive migration `0007`; no buyer contact data is exposed in the seller UI.
- Current product-file upload cap remains 50 MB per file, with multiple files supported. Files remain private. No physical products or shipping workflows are introduced.
- Storefront prices currently display TND because the existing order schema and money helpers are TND-based. Multi-currency pricing and international payout support remain future work; do not advertise global payout coverage until a provider is selected and verified.
- The product-detail page intentionally does not offer checkout while live payments remain disabled.
- Migrations `0006`–`0009` are committed but not applied to Supabase. Apply them only to a disposable clone first and verify the full migration chain and RLS policies before merge.

## 11. Administrator dashboard — 2026-10-31

- Added a role-protected `/admin` route. The route verifies the signed-in user's `admin` role server-side during route loading; non-admin users are redirected to their account page.
- Added configurable commission controls (0–100%, two decimal places) using the existing audited/role-checked `admin_set_commission_bps` RPC. Commission changes affect new orders only; existing order snapshots are preserved.
- Added platform overview cards, latest-100 store moderation (activate/suspend), latest-100 product moderation (list/hide), and read-only latest-100 order monitoring.
- Added a homepage admin shortcut that is shown only when the signed-in user has the admin role.
- Added French, Arabic and English admin translations and aligned Supabase generated types with the non-null commission setting.
- Updated the TanStack route tree to register the file-based marketplace and admin routes that had not yet been included in the committed generated tree.
- The commission UI relies on the role-checked `admin_set_commission_bps` RPC. No live payout or payment action is exposed.
- No role was assigned to any account, no database was changed, and no production settings were modified.
- Validation remains pending: run lint, tests and production build, then verify admin and non-admin access with test accounts on a disposable environment.


## 12. Original Supabase project deployment — 2026-11-03

- The original project is `jgjcychkntsokhzeziqs` (`algorea-bazaar`, eu-west-1). The separate test project was not modified.
- Applied and recorded the complete migration chain `0000`–`0021` to the original project (including the new `0012a_storage_bucket_bootstrap` and `0020`/`0021` internal-function privilege hardening migrations).
- Updated `supabase/config.toml` and the tracked `.env` public project settings to the original Supabase URL and its public publishable key. No service-role key was added to GitHub.
- Added the missing Storage bucket bootstrap before the existing bucket size-limit migration. Final Storage state: `product-files` private, 50 MiB per file; `product-images` public, 10 MiB; `store-assets` public, 5 MiB.
- Verified 22 public tables; all 22 have RLS enabled. No public tables without RLS. The 5% default commission is present. Trigger-only SECURITY DEFINER helpers are no longer callable through the Data API by anon/authenticated roles.
- Confirmed the production database is still empty of auth users, products, stores, and Storage objects. No live payments, provider transfers, or seller payouts were activated.
- Regenerated and committed `src/integrations/supabase/types.ts` from the live original database after migration deployment.
- Remaining operational checks: create/assign the first administrator through a secure owner-controlled process; run a full app build and end-to-end signup/seller/catalog/download tests against this original project; confirm Lovable/Render runtime environment variables match this project. Security Advisor still reports authenticated SECURITY DEFINER RPCs that are intentionally exposed for app workflows and guarded by their function-level authorization checks; performance Advisor reports RLS plan/index optimization notices to address before scale.


## 12. Authoritative financial model — 2026-11-03 (supersedes conflicting historical notes above)

- Algorea Bazaar serves buyers worldwide, subject to payment-provider and legal coverage.
- Phase 1 seller onboarding is limited to Tunisia. Do not offer or promise global seller payout coverage.
- Buyer payments are collected for Algorea Bazaar and settled only to the platform's own merchant/settlement account.
- The payment provider is a collection/settlement rail only. It must never split or distribute seller proceeds.
- The platform's internal accounting system alone records collections, actual settlement, FX snapshots, 5% default commission, seller payables, and seller payouts.
- Canonical product accounting, commission, seller payable, and Phase 1 seller payouts remain in TND. Foreign buyer charge currency and actual platform settlement are recorded separately with immutable currency/FX metadata.
- Algorea Bazaar alone initiates seller transfers; weekly manual transfer is the default. Provider APIs do not pay sellers.
- Seller-facing Konnect, iPay, and WePay buttons are external information/account links only. They do not connect seller balances, collect buyer payments, or execute seller payouts.
- Added migration 0022_platform_central_financial_ledger.sql and the docs/central-financial-accounting.md specification. The migration is committed to GitHub but has not been applied to Supabase. It is additive and does not enable checkout or move money.
- Provider selection, global buyer currency coverage, sandbox validation, legal review, and separate explicit live-activation approval remain required.


## 13. Global buyer payment route and central-ledger review — 2026-11-03

- Buyers are the global target, subject to provider country/card/risk coverage and applicable law. Phase 1 sellers remain Tunisia-only.
- Konnect is the leading candidate for international card acceptance because its official public material documents international Visa/Mastercard, hosted API checkout, webhooks, payment lookup, sandbox, and TND/EUR/USD API tokens. Its published indicative international-card fee is 2.9%; the merchant contract controls.
- Current checkout adapter requests TND only, with bank_card listed first and local wallet/e-DINAR methods retained. International card issuers may convert the TND charge into the card's billing currency. Algorea Bazaar does not yet charge every buyer in their local currency.
- No live checkout is enabled. Konnect must first confirm in writing that it accepts Algorea Bazaar's digital multi-vendor model with the platform as sole collection beneficiary and no provider-side seller split or payouts.
- Added docs/global-buyer-payment-route.md and clarified currency behavior in the financial policy and buyer-facing TND notes.
- Reviewed original Supabase project jgjcychkntsokhzeziqs before deployment: migration history was 0000–0021; relevant order, item, payout and payout-preference tables existed; RLS was enabled; orders, order items, payout batches and payout preferences were all zero rows.
- Separate test project iblfizhtvzfnfuntnazk is empty (no migrations or public tables), so it is not a ready-made schema clone.
- Static review found and fixed SQL delimiter errors in migration 0022, added immutable FX/settlement snapshot enforcement, and tightened ledger amount/currency checks. A transaction-wrapped dry run against the original project's actual schema succeeded.
- Migration 0022 was then applied successfully to the original project. Post-apply checks confirmed migration history, ledger table/RLS, constraints, indexes, triggers, append-only behavior, and platform-only payout controls. The migration did not create transactions or move funds.
- The separate test project is empty and is not a ready-made clone. A full disposable migration-chain test remains pending; do not represent it as completed.
- No payment provider credentials were configured, no live checkout was activated, and no live payments or seller transfers occurred.


## 14. Migration 0022 deployment verification — 2026-11-03

- Applied migration 0022 successfully to the original Supabase project jgjcychkntsokhzeziqs; migration history now ends at 0022_platform_central_financial_ledger.
- Before application, the full migration was executed inside BEGIN/ROLLBACK against the actual original schema and returned migration_0022_dry_run_ok. The rollback was verified: no new ledger table/columns remained and order/payout rows stayed zero.
- After application, confirmed ledger table exists with RLS enabled; required indexes, constraints and triggers exist; direct Konnect payout setting is false; no orders, payouts or ledger rows exist.
- A transactional behavior test confirmed the direct-payout switch cannot be set true and ledger updates are rejected; test rows were rolled back and ledger remains empty.
- Regenerated and committed src/integrations/supabase/types.ts from the live original database.
- Security Advisor still reports 12 authenticated SECURITY DEFINER RPC warnings (including the admin-guarded payout RPC) and leaked-password protection disabled. Performance Advisor reports pre-existing RLS initialization-plan and unindexed-FK warnings; these were not part of migration 0022.
- Checkout remains fail-closed and TND-only. Konnect international Visa/Mastercard is the leading candidate, but written approval for the digital multi-vendor platform-collection model and sandbox fee/settlement reconciliation remain release gates.


## 15. Seller-borne external fees — 2026-11-03

- Migration 0023 was applied to the original Supabase project after a transaction-wrapped dry run. It adds append-only seller external-fee entries and payout allocations, with seller/admin read policies and admin-only recording RPC.
- Migration 0024 adds indexes for the remaining fee-table foreign keys.
- Admin fee entry requires actual TND amount, fee category, source, external statement/receipt reference and description. The fee is recorded in the central platform ledger as a seller-scoped provider-fee debit.
- Manual payout preparation allocates outstanding fees once, snapshots the fee total on the payout, and subtracts it from seller proceeds after commission. If fees exceed current proceeds, payout creation fails closed and leaves fees outstanding.
- Seller dashboard displays fee entries, allocated amounts, remaining amounts and external fees deducted on each payout. Admin dashboard can record actual fees, prepare payout, confirm completed transfer, and mark failure.
- Automatic provider fee API ingestion is not implemented; administrators must reconcile actual statements and enter verified fees manually. TND only; no estimated charges.
- Supabase TypeScript types regenerated and committed. No orders, fees, allocations, payouts or financial ledger entries were created. Checkout remains disabled; no provider credentials or live money movement were activated.
