# Algorea Bazaar — seller payout operations

## Approved operating model

Algorea Bazaar alone calculates, owes, authorizes, initiates, and records seller payouts. Payment providers are used only to collect buyer payments and settle those collections to the platform's own merchant/settlement account.

- Phase 1 seller onboarding is for sellers in Tunisia. Worldwide buyer access does not mean worldwide seller payout coverage.
- Seller registration, store creation, and product listings remain free. No registration, store-opening, listing, or mandatory seller subscription fee is charged.
- The platform commission is 5% by default and administrator-configurable. Each order item snapshots its commission rate and amounts; historical snapshots are never recalculated.
- After verified collection and settlement, the platform records the sale, commission, and seller payable in its internal financial ledger.
- Seller payout preference defaults to **weekly manual transfer**.
- During Phase 1, seller payables and transfers are denominated in TND.
- The platform operator transfers the seller's final recorded payable from the platform's funds to the seller's own account. The seller bears all verified external fees attributable to payment processing, collection, conversion, settlement, transfer and withdrawal. These fees are shown separately from the 5% commission and deducted from the seller's proceeds only once, using actual provider/bank evidence and a documented allocation method.
- An administrator records the transfer reference and marks the payout paid only after the real transfer has succeeded.
- The admin confirmation action is an accounting record only; it does not itself send money.
- Every payout batch has a unique idempotency key. Each verified sale ledger entry can belong to at most one payout batch. Failed transfers remain recorded and must not be silently released for duplicate payment.
- Sellers can view their payout history and recorded transfer references.

## Provider restrictions

- No provider may split a buyer payment or send seller proceeds directly.
- No provider API is used to initiate seller payouts.
- Seller registration links to Konnect, iPay, and WePay (where shown in the seller workspace) are external account-information links only. They do not authorize those providers to control seller balances or distribute marketplace proceeds.
- Do not collect or store seller payment-provider passwords, OTPs, or private credentials.
- Do not promise a seller payout route until the platform has verified the seller's destination details and lawful transfer method.

## Buyer collection and FX

- Buyers may purchase from any country, subject to the selected payment provider's confirmed coverage.
- The provider must settle buyer collections to the platform's own merchant/settlement account.
- Product prices and seller accounting remain TND during Phase 1. If a buyer is charged in a foreign currency, preserve the exact buyer amount/currency and the provider's actual settlement amount/currency with the FX rate, source, and timestamp.
- Calculate commission and seller payable from the canonical TND accounting amount. Informational exchange-rate displays are not accounting evidence.
- Reconcile provider fees and FX differences separately. Allocate all verified external fees attributable to the sale to the seller; never hide them inside the 5% commission.
- For shared order-level fees, allocate proportionally to each seller's attributable paid order amount unless provider evidence identifies the seller-specific amount.
- Do not finalize or transfer a seller payable until the actual external fee amount and allocation are supported by provider/bank evidence. The seller statement must show gross sales, 5% commission, each fee allocation, and final payable.

## Payment activation safety

- Checkout remains disabled until a provider confirms in writing that it supports worldwide buyers, the platform-owned collection model, digital multi-vendor sales, the required currencies, and settlement to the platform's account.
- Provider API credentials alone do not enable checkout. Sandbox verification, fee disclosure, webhook/status verification, refund/chargeback handling, and explicit approval for live activation are required.
- No provider connection, automatic payout, live payment, or production deployment is authorized by this document.

## Weekly operating procedure

1. In the administrator dashboard, select the seller's store and prepare a payout batch from verified, settled sales.
2. Review the original sale amount, currency/FX snapshot, platform settlement, provider fees, commission-rate snapshot, and seller payable against the platform ledger.
3. Transfer the displayed seller payable from the platform's own funds using the approved external transfer method.
4. After the transfer succeeds, record the transfer reference in the administrator dashboard and confirm the payout.
5. If the transfer fails, record the reason. Do not create another payout batch for the same sales.

## Database rollout

Migration 0022 has been applied to the original Supabase project after a transaction-wrapped compatibility dry run against its current schema. It adds the append-only platform ledger, immutable FX/settlement snapshots, and database constraints that prohibit direct provider payouts. Post-apply verification confirmed the migration history entry, RLS, indexes, triggers, and append-only behavior. The database still contains zero orders and payout records. Checkout and live payment activation remain disabled.
