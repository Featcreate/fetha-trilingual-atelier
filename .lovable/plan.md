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

## 4. Financial fee allocation policy — approved 2026-10-31

- Algorea Bazaar's platform commission is 5% by default and administrator-configurable, calculated separately from all external payment, transfer, and withdrawal fees. The 5% rate is captured in each order item as an immutable snapshot.
- The buyer bears the external fee charged for the payment method the buyer selects, provided the provider's terms and applicable law permit the fee to be passed through and the exact fee can be disclosed before confirmation.
- The seller bears external fees charged for receiving, transferring, or withdrawing the seller's proceeds. Weekly seller payouts remain manual.
- Algorea Bazaar must not absorb, reimburse, or record any provider, bank, transfer, or withdrawal fee as a platform expense. Such fees must never reduce the platform commission.
- External fees must be separately identified, accurately calculated from the selected provider/method, and disclosed to the responsible customer before the relevant transaction. No hidden fees and no guessed or hard-coded fee schedule.
- If a provider charges the platform account and its fee cannot lawfully and transparently be assigned to the responsible buyer or seller, do not activate that payment/payout method until the commercial and technical arrangement is resolved.
- Do not assume iPay's quoted rate or cap, any referral program, or any other provider's pricing without current written confirmation. We have confirmed that the referral code is not issued by iPay itself. The planned referral code is the platform owner's own Konnect account referral code, to be used for Tunisian seller registration through the Konnect service within the iPay arrangement. The actual Konnect code/link must be supplied and verified before configuring this onboarding route; do not invent it. Confirm the supported account-linking and manual transfer procedure before enabling payouts.
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
- No live payment provider, deployment, or production database was changed. The referral code will come from the platform owner's Konnect account, not from iPay. The platform owner has supplied the Konnect referral code `31XyM7MR8wy71ga7a` and registration link https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a. Verify that this exact link correctly routes and attributes Tunisian seller registrations to the platform owner's Konnect account. Confirm seller account identification/linking, manual transfer support, fees, and terms before enabling payouts. Multi-currency and international payout support remain blocked on provider selection and verification.

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
