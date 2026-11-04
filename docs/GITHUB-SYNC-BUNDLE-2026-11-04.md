# Algorea Bazaar — GitHub Sync Bundle Audit

Audit date: 2026-11-04
Base: `main`
Audited base commit: `7eccb59089e3c6582f9a94ae0f5335b939cf6704`
Purpose: prepare the repository source for a later manual Lovable synchronization only. This is not a launch, deployment, or production-readiness approval.

## Current source baseline

The latest main commit is the squash merge of PR #32, `fix: finalize Algorea Bazaar sync readiness`. PR #32's CI run #192 succeeded for formatting, lint, tests, and build before merge.

The source already contains:

- the Algorea Bazaar local brand-logo path and a homepage hero that does not depend on the missing remote Lovable banner;
- fallback handling for product preview images;
- all 16 digital product types and category shortcuts;
- seller-owned latest-product cards on the homepage;
- informational TND-to-USD/EUR equivalents across the homepage, catalogue, product, store, and seller views;
- trilingual product translation invocation from seller create/edit flows;
- seller store logo/avatar/banner editing components;
- central financial ledger, seller external-fee records and proportional fee allocation, idempotency migrations, and seller-selected payout destinations with immutable payout destination snapshots.

## Open pull-request disposition

The following open PRs were audited against the current main tree and the approved project rules. They are stale, duplicated, or incompatible with the current migration history and should not be merged:

| PR  | Disposition                           | Reason                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #5  | Close as superseded                   | Adds a second migration numbered/tagged 0015 (`0015_configurable_financial_routing`) even though main already uses 0015 for the product image gallery and has later migrations through 0030. Its configurable provider-routing panel also adds unnecessary provider configuration surface not required for source sync. |
| #7  | Close as already integrated           | The current homepage already queries and renders up to six latest active products from the signed-in seller's own store.                                                                                                                                                                                                |
| #8  | Close as already integrated           | Main already exposes the 16 supported product types in homepage categories and catalogue filtering.                                                                                                                                                                                                                     |
| #10 | Close as superseded by current policy | Its older policy text conflicts with the current evidence-based fee register and seller fee-allocation implementation. Current policy keeps the 5% commission separate and records only actual, evidenced external fees, allocated once to seller proceeds.                                                             |
| #11 | Close as incompatible/duplicate       | Adds another migration numbered/tagged 0015 (`0015_seller_payment_provider_choice`), conflicts with the existing migration journal, and hardwires a seller provider choice UI not needed for the approved flexible seller receiving-destination model.                                                                  |
| #19 | Close as already integrated/stale     | Main already includes the TND equivalent component and its usage across relevant marketplace/seller views. Its branch diverged substantially from current main and must not be merged wholesale.                                                                                                                        |
| #22 | Close as redundant validation-only PR | It only changes a roadmap validation note; the fee-accounting implementation is already represented on main and has passed CI in its feature history.                                                                                                                                                                   |

Do not merge any of these stale branches. Their historical commits are retained in GitHub for reference.

## Approved financial and marketplace invariants

- Digital downloads only; no physical shipping.
- Seller registration, store creation, and product listing remain free.
- Buyer collection and seller receiving destinations are separate.
- Default platform commission is 5%, adjustable for future transactions only; existing order snapshots remain immutable.
- Seller receiving destination is selected by the seller from available methods (for example iPay, WePay, bank transfer, or another supported method). The platform's weekly manual payout cadence is not itself a receiving provider.
- The platform alone calculates and initiates weekly manual seller transfers. No provider split payment or automated seller payout is enabled.
- External provider/bank fees are separate from the platform commission. Only actual, evidenced fees are recorded and allocated once according to the approved allocation rules; statements must itemize them.
- Live payments remain disabled pending provider, legal, fee, and sandbox verification plus explicit approval.
- No production data, secrets, live provider credentials, or deployment settings are changed by this sync bundle.

## Migration and Supabase boundary

The main migration journal contains migrations 0000–0030, including the fee idempotency/mixed-rate work (0026–0028), role helper hardening (0029), and seller payout destination snapshots (0030).

Migration 0030 was applied and verified separately on the designated test and production Supabase projects under prior explicit approval. Do not reapply it. This audit performs no Supabase operation and does not authorize any new migration application.

## Lovable-related dependencies

The following Lovable integration pieces remain in source:

- `@lovable.dev/vite-tanstack-config` in `vite.config.ts` and `package.json`;
- `@lovable.dev/cloud-auth-js` and `src/integrations/lovable/index.ts`;
- `src/lib/lovable-error-reporting.ts`, referenced by the root route.

They are intentionally retained for this source-sync phase. Removing the build configuration or OAuth adapter without a verified replacement could break the build or authentication and is not necessary to prepare the GitHub source for a later Lovable sync. No Lovable project was opened or modified during this audit.

## Remaining verification notes (not blockers to source sync)

1. The local PNG logo path is in use, but its alpha channel and rendered appearance have not been independently verified. Do not claim transparency until inspected.
2. The homepage banner was intentionally deferred; the hero is text-led and no replacement banner was added.
3. The `translate-product` Edge Function source exists, but its deployment/reachability and authenticated smoke test were not verified in this source-only pass.
4. Seller asset upload/replace/delete and anonymous storefront display still need an end-to-end test with disposable accounts.
5. Render environment variables and deployment state were not inspected or changed.
6. The latest main merge commit has no workflow run/status returned by the GitHub commit-run/status endpoints in this audit. PR #32's pre-merge CI run #192 is the verified successful CI evidence. Run CI again on this documentation PR before treating the combined sync bundle as checked.

## Scope of this PR

This PR adds only this audit/manifest document. It does not modify application code, SQL migrations, database state, secrets, provider configuration, or deployment settings. It does not perform the Lovable synchronization. Once this PR's CI passes and the documentation is merged, the repository will have a single current sync manifest; the user can then perform the actual source synchronization in Lovable separately.
