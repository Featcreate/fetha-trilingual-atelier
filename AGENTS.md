<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- UI text lives in the static dictionary in src/lib/i18n.ts (fr default, ar RTL, en); add every new string for all three languages so switching never shows missing text.
- Payments settle only through the service-role `settle_order_payment` RPC (verified or simulation mode; simulation never writes seller ledger) — one idempotent, transactional path.
- Downloads go reserve_download → sign (300s) → finalize_download; release on signing failure — quota counts only finalized downloads and 5-minute repeats are free.
- Product files live in immutable `product_file_versions` with server-built paths; `product_files` is deprecated and kept only for compatibility.
- Seller file retention is manual: never automatically delete files or old versions. Sellers may request deletion only for archived versions; block physical deletion whenever an immutable `order_item_files` purchase snapshot references the version. Keep the version row and append a `storage_cleanup_audit` record; never delete buyer entitlements or purchase snapshots.
- Seller storage quota must count only `product-files` Storage objects that physically exist; deleting an eligible archived object frees its bytes while immutable file-version metadata remains for audit.
- Financial, purchase-snapshot, entitlement and audit rows use ON DELETE RESTRICT plus immutability triggers — never cascade-delete them.

## Seller country and provider eligibility

- Worldwide buyers are supported as the product target, subject to the selected buyer-payment provider's confirmed coverage and applicable law.
- Phase 1 seller onboarding is limited to sellers in Tunisia. Do not advertise or promise worldwide seller onboarding or payout coverage.
- Seller-facing Konnect, iPay, and WePay buttons are optional external information/account links only. They are not buyer-payment integrations, account-linking mechanisms, or payout execution features.
- Seller store creation and product listing must not depend on registering with any of these providers.
- Never collect provider passwords, OTPs, API secrets, or private credentials.

## Authoritative financial model

- Buyer payments are collected for Algorea Bazaar and settled only to the platform's own merchant/settlement account.
- The payment provider is a collection/settlement rail only. It must never split payments, hold seller balances on the platform's behalf, or distribute seller proceeds directly.
- Algorea Bazaar's internal financial system is the sole source of truth for collections, actual settlement records, FX snapshots, the configurable 5% default commission, seller payable balances, and payout records.
- Canonical product accounting, commission, seller payable, and Phase 1 seller payouts are denominated in TND. Current buyer checkout is also TND-only; a foreign card issuer may convert the TND charge into the buyer's billing currency. Do not claim local-currency checkout until the provider-specific FX flow is implemented and verified.
- Algorea Bazaar alone initiates seller transfers. Weekly manual transfer is the default. No provider API may initiate seller payouts; direct Konnect payout capability must remain disabled.
- Migration 0022 is applied to the original Supabase project jgjcychkntsokhzeziqs and recorded in its migration history. The append-only platform financial ledger, immutable buyer/settlement snapshot controls, and weekly/manual-only payout constraints are active. The database has zero orders, order items, payout batches and payout preferences as of 2026-11-03.
- The current checkout adapter is Konnect and sends TND only. Its public documentation lists international Visa/Mastercard acceptance; the provider must still approve the exact digital multi-vendor, platform-as-sole-collection-beneficiary model in writing before checkout activation.
- The current payment activation helper is fail-closed. No sandbox or live payment credentials/settings were changed, and no live payment is active.
