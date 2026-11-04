# Algorea Bazaar — Final GitHub Sync Readiness

Audit date: 2026-11-04  
Target: `main`  
Working branch: `fix/final-sync-readiness`

## What this change repairs

- Removes the homepage's dependency on the missing Lovable-hosted banner asset. The existing responsive, trilingual homepage hero is now the first visual hero section and no longer waits for a remote image or renders a broken-image placeholder.
- Changes the official brand logo source to the repository-owned `/brand/algorea-bazaar-logo.png` asset.
- Removes six obsolete Lovable asset-proxy pointer files in total: the logo, homepage banner, and four unused sample/product image pointers. A repository search found no source-code references to the four remaining sample image pointers before they were removed.
- No Lovable asset URL is required by the homepage or brand-logo component after these changes. The deferred homepage banner design is intentionally not included.

## Verified implementation already present on main

### Product translations

- `src/lib/product-translations.ts` invokes the Supabase Edge Function `translate-product`.
- The authenticated seller workflow calls `translateProductContent()` when creating a product and again when saving edits.
- Both product name and description translations are stored in `name_translations` and `description_translations` for French, Arabic, and English.
- A translation error blocks the create/edit save and displays the translated failure message rather than silently publishing untranslated content.
- The Edge Function source exists at `supabase/functions/translate-product/index.ts`. It authenticates the caller with `auth.getUser()`, validates lengths, detects the source language, and attempts translation through community-hosted LibreTranslate mirrors.
- Remaining operational check: confirm the function is deployed and reachable in the target Supabase project. Public mirror availability/rate limits are external dependencies; the code fails closed if translation is unavailable.

### Seller store branding

- `StoreBrandingEditor` already supports logo, seller avatar, and store banner upload, replacement, and removal.
- Uploads are limited to JPEG, PNG, WebP, or AVIF and 5 MiB each.
- Files are stored in the public `store-assets` bucket under a store-specific path. The store record is updated only for the owning seller; a failed record update removes the newly uploaded object.
- The public storefront reads the saved logo, avatar, and banner paths and displays them.
- Migration `0017_store_branding_assets.sql` defines the bucket and owner-scoped upload/update/delete policies.
- Remaining operational check: exercise upload, replace, delete, and anonymous storefront display against a disposable seller account. Source inspection is not an end-to-end test.

## Previously merged work retained

- PR #27: distinct icons for all 16 product categories.
- PR #28: seller receiving destinations separated from weekly manual payout records.
- PR #30: resilient product preview fallback behavior.
- CI run #185 (PR #28) and #184 (PR #30) completed successfully before merge.
- Migration `0030_seller_payout_destinations` is recorded as applied in production and test. Production read-only verification confirmed destination fields, payout snapshot fields, active guard trigger, seller policy, and function privilege posture. No orders, payment events, seller payout preferences, or payouts were present at the verification snapshot.

## Remaining release checks outside a GitHub-only change

1. **Logo transparency:** the repository-owned PNG exists, but its alpha channel and final visual appearance were not independently inspected in this audit. The source is now local; if its background is not transparent, replace it with the approved transparent original.
2. **Supabase Edge Function deployment:** confirm `translate-product` is deployed in the intended project and run a real authenticated translation smoke test. No function deployment was performed here.
3. **Seller asset end-to-end test:** test uploads and storefront rendering with disposable test accounts.
4. **Render:** inspect the deployed commit and environment variables. This audit did not change Render settings or deploy.
5. **Payment safety:** the code has explicit sandbox/live switches, but Render environment values were not inspected. Do not infer production payment status from source code alone. Do not activate live payments without separate approval.
6. **Remaining Lovable integration:** `vite.config.ts` still imports `@lovable.dev/vite-tanstack-config`, and `package.json` retains Lovable packages. The auth adapter and error-reporting helper also remain in source. They were not removed because OAuth and build behavior require a controlled replacement and test; deleting them blindly could break sign-in or the build.
7. **Full acceptance:** run the full buyer/seller/admin, private download, payout snapshot, security, responsive UI, and translation regression suite before public release.

## Financial and product invariants retained

- Digital products only; no physical shipping.
- Seller signup, store creation, and listings remain free.
- Buyer collection is separate from seller receiving.
- Platform commission default is 5%.
- Seller chooses an available receiving destination; weekly manual platform-initiated payouts remain the Phase 1 model.
- Verified external provider/transfer/withdrawal fees are borne by the seller separately from the platform commission and must be disclosed.
- No automatic split, no automatic seller transfers, no live payments, and no refunds are activated by this change.
- TND remains the authoritative Phase 1 accounting currency; USD/EUR equivalents are informational only.

## Validation status for this branch

- Source-level checks: the logo component no longer imports the proxy JSON; homepage no longer imports or renders the missing banner URL; the local logo path exists; existing hero content remains in place; six Lovable asset-proxy pointer files have been removed.
- CI: the latest workflow run on the previous branch head was blocked in `action_required` before jobs started. The new cleanup commits need their own CI run and GitHub may again require approval to run it.
- No database schema, production data, secrets, provider credentials, or Render settings were changed.
- No Lovable project was opened or synchronized by this work.
