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

## 4. Risks
- Design: new pages must reuse the existing color tokens and fonts; the header/footer live inside the homepage file, so extracting them for other pages must be done without visual change.
- Logo: the supplied logo has a dark background; on the cream header it will show as a dark disc — acceptable, but check contrast.
- Security: public webhook route exists (verifies with Konnect before any change — safe, but dormant). Product images bucket is private, so the storefront will need signed or public-read image access later. No admin assigned yet; first admin must be granted manually via the backend, never from the browser.
- Data: schema changes must stay additive (no drops/renames).

## 5. Files for the brand milestone (not changed now)
- `public/brand/` — add the new logo file (e.g. `algorea-bazaar-logo.jpg`)
- `src/components/BrandLogo.tsx` — logo path, alt text "Algorea Bazaar", remove slot
- `src/lib/i18n.ts` — hero texts FR/AR/EN, logo-slot label, storage key
- `src/routes/index.tsx` — title, description, og tags, footer copyright
- `src/routes/__root.tsx` — default title/description
- `src/styles.css` — comment only
- `src/lib/shop.functions.ts` — payment description label (optional; payment code otherwise untouched)

## 6. Confirmations
- Yes, real database work exists: 3 applied migrations, 7 tables, security policies, 2 private buckets — the empty `drizzle/schema.ts` is normal (migrations are SQL files).
- Yes, Konnect payment logic exists in code but is inactive (no credentials, no UI calls it, no transactions ever made).
