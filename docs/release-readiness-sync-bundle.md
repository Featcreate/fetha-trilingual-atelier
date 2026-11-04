# Algorea Bazaar — Consolidated Release & Sync Readiness Bundle

**Audit snapshot:** 2026-11-04  
**Base branch:** `main`  
**Base commit:** `635d5ac2465e6af74e951670266165e4f02ce751`  
**Purpose:** Keep the approved product, technical, financial, security, and deployment decisions in one reviewable GitHub document so the project can be synchronized in one controlled pass rather than through repeated small edits.

This document records verified repository/database facts and explicitly separates completed work from remaining blockers. It is not a deployment approval and does not authorize live payments, provider changes, production data changes, or publishing.

## 1. Approved product and operating rules

- Product name: **Algorea Bazaar**. The repository name may retain its historical name; customer-facing product identity must not.
- Digital products only: downloadable files, bundles, apps, and software. No physical shipping.
- Buyer reach may be international; Phase 1 seller onboarding is limited to Tunisia.
- Seller registration, store creation, and product listing remain free.
- French is the default language; Arabic must use RTL and Tajawal; English uses LTR.
- The 16 product categories remain available, with distinct icons and working catalogue filters.
- TND is the authoritative accounting and Phase 1 pricing currency. USD/EUR equivalents are informational only and must never be used as checkout or accounting FX rates.
- Product title and description should be entered once and automatically translated for Arabic, French, and English. The current integration still needs verification (see §4).

## 2. Approved financial model

- Default platform commission: **5%**, snapshotted on each order item.
- Buyer collection is separate from seller receiving. Konnect is the intended buyer-collection provider, subject to provider/legal verification.
- Seller chooses a supported receiving destination: iPay, WePay, bank transfer, or another supported method. Do not require sellers to open a Konnect account.
- Seller settlements are prepared and transferred manually on a weekly cadence by the platform operator.
- The payout record snapshots the seller's selected destination so later preference edits cannot redirect an already-created payout.
- Verified, evidenced external provider/transfer/withdrawal fees are seller-borne, separate from the platform's 5% commission, and must be disclosed in the seller statement. The platform must not absorb these costs.
- No automatic split payment, no automatic seller transfer, and no live payment activation until provider terms, fees, supported currencies/countries, legal requirements, and explicit approval are confirmed.

## 3. Verified work already present on `main`

| Area                       | Verified state                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage categories        | PR #27 merged. The current homepage mapping contains 16 distinct category icons.                                                       |
| Product image fallback     | PR #30 merged. `ProductPreview` uses the public `product-images` bucket and displays an `AB` fallback if the image is absent or fails. |
| Seller payout destinations | PR #28 merged. Seller destination values are separated from the platform's weekly manual payout mechanism.                             |
| Database migration 0030    | Recorded as applied in both test and production Supabase projects. Production verification is detailed below.                          |
| CI for PR #28              | GitHub Actions run #185 completed successfully on the PR head: migration-journal check, typecheck, formatting, lint, tests, and build. |
| CI for PR #30              | GitHub Actions run #184 completed successfully on the PR head: typecheck, formatting, lint, tests, and build.                          |

Successful PR-head CI runs do not constitute a post-deployment visual or end-to-end test of the current Render service.

## 4. Current blockers and work still required

### A. Brand assets — blocking visual release

- `src/components/BrandLogo.tsx` still imports `src/assets/algorea-bazaar-logo.png.asset.json`.
- `src/routes/index.tsx` still imports `src/assets/homepage-banner.jpg.asset.json`.
- Both JSON references point to the old Lovable asset proxy path under `/__l5e/assets-v1/...`.
- `public/brand/algorea-bazaar-logo.png` exists in the repository, but this audit did not establish whether its pixels have transparency or whether it is the approved final transparent logo.
- No standalone homepage banner file was found in `public`.
- PR #30 improves failure fallbacks; it does not replace the source assets. The fallback is not a substitute for the approved logo/banner.

**Required before visual release:** provide the approved transparent Algorea Bazaar logo and either provide the original homepage banner or explicitly approve creation of a new one. Then replace the proxy-based references with repository-owned assets and test the result on desktop and mobile.

### B. Automatic trilingual product translation — integration verification required

- `src/lib/product-translations.ts` defines `translateProductContent()`, which invokes the Supabase Edge Function `translate-product`.
- Repository code search found the function definition but did not establish that the seller create/edit workflow invokes it automatically and persists all three translations.
- Verify the Edge Function exists, is deployed to the intended environment, handles errors safely, and is called on both product creation and content edits. Verify Arabic RTL and all three storefront languages with test data.

### C. Seller branding uploads — end-to-end verification required

- The public store page reads `logo_path`, `avatar_path`, and `banner_path` from the store record and renders the corresponding `store-assets` URLs.
- The presence of these display fields alone does not prove that seller upload, replacement, storage permissions, and public rendering all work.
- Verify upload, replacement, file-type/size limits, RLS/storage policy, and display as an authenticated seller and an anonymous visitor. Do not expose private seller payout information through public store assets.

### D. Render configuration and runtime — not verified

- The intended Render service is `fetha-trilingual-atelier-2`; the GitHub repository's default branch is `main`.
- Render environment variables and the current deployed commit were not accessible during this audit.
- The code has separate fail-closed sandbox/live payment switches, but the actual Render environment values have not been inspected. Therefore do not claim live payments are disabled in Render until its environment is checked.
- Do not add payment secrets, change Render settings, or deploy as part of this bundle.

### E. Build portability — review required before leaving the Lovable build environment

- `vite.config.ts` imports `@lovable.dev/vite-tanstack-config`.
- `package.json` still contains `@lovable.dev/cloud-auth-js` and `@lovable.dev/vite-tanstack-config`.
- This audit did not determine whether those packages are runtime-critical, build-only, or replaceable without changing authentication/build behavior. Do not remove them blindly. Complete a controlled portability test before relying on a non-Lovable build environment.

### F. End-to-end acceptance tests — outstanding

Run controlled tests using disposable test accounts and test products for:

- seller registration, email verification, free store creation, and seller branding uploads;
- product creation/editing, all supported digital product types, multiple private download files, and image previews;
- automatic trilingual translation and language/RTL behavior;
- buyer checkout in a disabled/sandbox-only state, webhook idempotency, paid-order reconciliation, and secure download entitlement;
- seller statements, 5% commission snapshots, seller-borne evidenced external fees, weekly manual payout creation, idempotency, and immutable destination snapshots;
- role separation: buyer, seller, admin, and anonymous visitor.

Do not use real buyer charges or real seller transfers in acceptance testing.

## 5. Production Supabase verification — migration 0030

Production project checked: `jgjcychkntsokhzeziqs`.

Verified read-only after the migration:

- Migration `0030_seller_payout_destinations` is present in migration history.
- All five seller destination columns exist; `method` is `text` with default `'other'`.
- All six payout destination snapshot columns exist.
- `seller_payout_preferences_guard` exists and is enabled.
- The seller-owned active-store RLS policy exists.
- The guard function has no EXECUTE grant for `PUBLIC`, `anon`, or `authenticated`.
- `admin_create_seller_payout(uuid,text,timestamptz)` is SECURITY DEFINER; `anon` cannot execute it; `authenticated` can reach the function but the function itself rejects requests unless `auth.uid()` has the admin role.
- Counts at audit time: 0 seller payout preferences, 0 seller payouts, 0 orders, and 0 payment events.

This verifies schema/privilege state, not a real payout. No payout was created and no money was moved.

## 6. Open pull requests that must not be blindly merged

These older open PRs need to be reviewed against this document before any merge:

- **PR #10** describes an older fee policy in which external provider fees must not reduce seller entitlement. That conflicts with the currently approved rule that documented seller-borne external fees are charged to the seller separately from the 5% platform commission. Do not merge as-is.
- **PR #11** offers Konnect/iPay as seller destination choices. It is superseded by the current destination model (iPay, WePay, bank transfer, other) and separation of buyer collection from seller receiving. Do not merge as-is.
- **PR #19** overlaps current homepage/category and indicative FX work. Its latest CI state and diff against current `main` require review; do not merge just to synchronize changes already present.
- **PR #22** is described as a documentation-only validation PR. Confirm its latest head and CI result before deciding whether any content is still useful.

PR #28 and PR #30 are already merged. PR #14 and PR #29 were superseded and must not be treated as merged.

## 7. Single-pass validation checklist

After completing the blockers above on a dedicated branch, run the repository's CI-equivalent checks:

```sh
bun install --frozen-lockfile
bun run check:migrations
bun run typecheck
bun run lint
bun run test
bun run build
```

Then perform:

1. Disposable-database migration and RLS regression tests.
2. Authenticated seller/admin and anonymous storefront tests.
3. Desktop/mobile visual acceptance with the final approved assets.
4. Render environment review and deployment-preview smoke test.
5. Confirm payment flags remain off unless separately approved.

## 8. Explicit exclusions

This bundle does not authorize:

- use of Lovable or consumption of Lovable credits;
- changes to production database schema or data beyond the already-applied migration 0030;
- live payment activation, real charges, refunds, or seller transfers;
- provider account creation, provider connection, or credential changes;
- Render environment changes, deployment, or public release;
- merging this documentation PR or any other open PR into `main`.

**Release posture at this audit:** core code changes for categories, product image fallbacks, and seller payout destinations are merged; migration 0030 is verified in production; visual assets, translation integration, seller-upload end-to-end tests, Render configuration, portability, and full acceptance testing remain open.
