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
- Canonical product accounting, commission, seller payable, and Phase 1 seller payouts are denominated in TND. Foreign buyer charge currency and actual provider settlement currency/amount must be stored separately with immutable FX metadata once the provider-specific checkout flow is approved.
- Algorea Bazaar alone initiates seller transfers. Weekly manual transfer is the default. No provider API may initiate seller payouts; direct Konnect payout capability must remain disabled.
- Migration 0022 adds the append-only platform financial ledger and enforces weekly/manual platform-only seller payouts. It is committed to GitHub but is not applied to Supabase unless separately approved after disposable-clone verification.
- Keep live checkout disabled until a provider confirms worldwide buyer coverage, digital-goods/multi-vendor acceptance, platform-owned collection, settlement currencies, fees, refunds/chargebacks, and server-side payment verification. Live activation requires separate explicit approval.
