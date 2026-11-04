# Algorea Bazaar — Read-only audit (2026-11-04) and staged backlog

No files, database, secrets, integrations, deployment or payments were changed. Approving this plan only approves the backlog order; each stage still needs separate approval.

## 1. Verified facts
- Pages: `/` (home: banner, latest products, categories), `/catalog` (search + type filter), `/products/$id`, `/stores/$slug`, `/auth`, `/reset-password`, `/terms`, plus signed-in pages `/account`, `/orders`, `/seller`, `/admin`. One public webhook: `/api/public/konnect/webhook`.
- Brand: no "FethaCreate" text is left in `src/`. French is the default language, Arabic is RTL, English is included (`src/lib/i18n.ts`).
- Tests: 6 files, 33 tests pass (vitest, run during this audit). These are pure-logic tests; none touch the live database.
- Build log: there was no build-errors entry to read in this session.
- Connected backend (vjqeuvvnavsdjzdqfyrs): 1 user, 0 admins, 1 store, 1 product, 7 file versions, 0 orders. Both storage buckets (`product-files`, `product-images`) are **private**.
- The app's `.env` points to a **different** project (jgjcychkntsokhzeziqs), so the preview's browser code and the audit tools are probably looking at different databases.
- The repo has 33 migrations (up to `0030_seller_payout_destinations`). The connected schema has no tables from the later financial migrations (for example the platform financial ledger or seller payout destinations).
- Payments are fail-closed (`payment-activation.ts`). No live credentials were found. Simulation is blocked when live.

## 2. Findings by priority
**P0**
- Backend identity split: the `.env` project and the connected project don't match, so no result from the database or the preview can be trusted until this is fixed.
- Migrations 0007–0030 are not reflected in the connected database, and the code expects them (seller payouts, platform ledger). Seller and admin financial screens will probably fail at runtime against this database. This is an assumption: it needs a check in the browser.
- No admin account exists, so the whole admin area can't be reached or tested.

**P1**
- The `product-images` bucket is private, but the catalog expects public cover images, so covers will not show. Fixing this needs the image migrations 0014/0015.
- Download quota, simulation and concurrency rules were never run against a real database (the Category A/B plans were never executed).
- Konnect has no written provider approval yet, and iPay was named as a future provider. The provider decision is still open.
- Earlier sessions reported possible type errors (`admin.tsx` passing `_scheduled_for: null`, plus `index.tsx`, `TndEquivalents.tsx` and `StoreBrandingEditor.tsx`). These need a fresh typecheck.

**P2**
- The catalog dropdown and the 16 product types vs. the 10 homepage categories should be reconciled.
- The 404 and error pages are English-only and hardcoded; they are not in the FR/AR/EN dictionary.
- The favicon is hard to read at 16px.
- The Render allowed host (`-5` vs. the real `-2`) doesn't match.

**P3**
- Several placeholders are literal (`ma-boutique`, `12.500`, `0.00`) instead of translated text.
- The deprecated `product_files` table is still present (this is intentional).

## 3. Needs manual or provider testing
- A full browser flow for signup, seller store creation, upload, buying, the library and downloads, all against the correct backend.
- Arabic RTL layout on the seller and admin pages.
- Konnect sandbox, only after written approval. Weekly manual payouts, with the seller choosing the payout method, once an admin exists.

## 4. Staged backlog (revised order)
1. Visual and translation fixes, front end only with no database risk: run a fresh typecheck and fix any errors, translate the 404/error pages and literal placeholders into FR/AR/EN, reconcile the categories, improve the favicon, and fix the Render host.
2. Agree which backend is the real one and reconnect it. Re-run the read-only schema and migration diff.
3. Apply the missing migrations in order on a disposable or confirmed copy first. Then run the Category A rollback tests.
4. Create the first admin through a protected role assignment, then check the admin and seller financial screens.
5. Images: make the preview bucket public and apply 0014/0015, then check covers and galleries.
6. Payment provider decision and sandbox, kept last, only with explicit approval. Live payments and publishing stay off.
