# Algorea Bazaar — seller payout operations

## Approved operating model

Algorea Bazaar alone calculates, owes, authorizes, initiates, and records seller payouts. Payment providers are used only to collect buyer payments and settle those collections to the platform's own merchant/settlement account.

- Phase 1 seller onboarding is for sellers in Tunisia. Worldwide buyer access does not mean worldwide seller payout coverage.
- Seller registration, store creation, and product listings remain free. No registration, store-opening, listing, or mandatory seller subscription fee is charged.
- The platform commission is 5% by default and administrator-configurable. Each order item snapshots its commission rate and amounts; historical snapshots are never recalculated.
- After verified collection and settlement, the platform records the sale, commission, and seller payable in its internal financial ledger.
- Sellers select their own receiving destination (Konnect, iPay, WePay, bank transfer, or another supported method). Weekly manual transfer is the platform's settlement cadence, not a seller receiving destination.
- The seller's name, account identifier, provider/bank and optional routing notes are stored as private payout details. Passwords, PINs, OTPs and API secrets must never be collected.
- Each payout batch snapshots the selected destination. Editing the seller's preference affects future batches only; it cannot redirect an existing batch.
- During Phase 1, seller payables and transfers are denominated in TND.
- The platform operator transfers the seller's recorded payable from the platform's funds to the seller's own account. The seller is responsible for any external fees their chosen receiving provider or bank may charge. Algorea Bazaar does not cover, record, allocate, deduct, reimburse, or display these receiving/withdrawal fees in the seller payout statement. The payout amount is calculated from verified seller proceeds after platform commission only.
- An administrator records the transfer reference and marks the payout paid only after the real transfer has succeeded.
- The admin confirmation action is an accounting record only; it does not itself send money.
- Every payout batch has a unique idempotency key. Each verified sale ledger entry can belong to at most one payout batch. Failed transfers remain recorded and must not be silently released for duplicate payment.
- Sellers can view their payout history, transfer references, receiving method, and the amount transferred. External receiving/withdrawal fees are not part of the platform payout record or seller statement. Administrators can view the destination snapshot needed to complete each manual transfer.

## Provider restrictions

- No provider may split a buyer payment or send seller proceeds directly.
- No provider API is used to initiate seller payouts.
- Konnect is the buyer-collection provider only. Seller receiving destinations such as iPay, WePay, a bank account or another supported route are independent of buyer collection and do not authorize providers to control seller balances or distribute marketplace proceeds.
- Do not collect or store seller payment-provider passwords, OTPs, or private credentials.
- Do not promise a seller payout route until the platform has verified the seller's destination details and lawful transfer method.

## Buyer collection and FX

- Buyers may purchase from any country, subject to the selected payment provider's confirmed coverage.
- The provider must settle buyer collections to the platform's own merchant/settlement account.
- Product prices and seller accounting remain TND during Phase 1. If a buyer is charged in a foreign currency, preserve the exact buyer amount/currency and the provider's actual settlement amount/currency with the FX rate, source, and timestamp.
- Calculate commission and seller payable from the canonical TND accounting amount. Informational exchange-rate displays are not accounting evidence.
- Reconcile provider fees and FX differences separately. Allocate all verified external fees attributable to the sale to the seller; never hide them inside the 5% commission.
- For shared order-level fees, allocate proportionally to each seller's attributable paid order amount unless provider evidence identifies the seller-specific amount.
- Calculate seller payables from verified sales after the applicable platform commission. The seller payout statement shows sales, discounts where applicable, platform commission, seller payable, payout status, and transfer reference; it does not show external receiving/withdrawal fees.

## Payment activation safety

- Checkout remains disabled until a provider confirms in writing that it supports worldwide buyers, the platform-owned collection model, digital multi-vendor sales, the required currencies, and settlement to the platform's account.
- Provider API credentials alone do not enable checkout. Sandbox verification, fee disclosure, webhook/status verification, refund/chargeback handling, and explicit approval for live activation are required.
- No provider connection, automatic payout, live payment, or production deployment is authorized by this document.

## Weekly operating procedure

1. Reconcile verified paid sales and seller ledger entries for the weekly period.
2. Prepare the weekly payout batch. The platform calculates the seller's payable after the applicable platform commission only; external receiving/withdrawal fees are not included.
3. Review gross sales, discounts, commission, and final seller payable.
4. Transfer the displayed payable from the platform's own funds to the seller's saved receiving destination.
5. After the transfer succeeds, record the transfer reference and confirm the payout. If the transfer fails, record the reason and retry the same payout; do not create a second batch for the same sales.

## Database rollout

Migrations 0022, 0023 and 0024 have been applied to the original Supabase project. Migration 0023 adds the append-only seller external-fee register, fee-allocation records, administrator-only fee recording, and fee-aware payout snapshots. Migration 0024 adds indexes for the remaining fee-table foreign keys. Migration 0025 adds automatic proportional allocation for shared order-level fees with exact largest-remainder rounding. The database currently contains zero orders, seller fee records, fee allocations, payouts, or platform ledger entries. Checkout and live payment activation remain disabled.

## Seller destination and batch snapshots

Migration 0030 introduced seller-selected receiving destinations independently from the weekly manual settlement rail. Migration 0031 superseded the earlier fee-aware payout calculation: new payout batches set the legacy `external_fees_millimes` field to zero and transfer the full verified seller payable after platform commission. Receiving/withdrawal fees charged by the seller's own provider or bank remain outside platform accounting and are not shown or deducted. Migration 0038 adds Konnect to the supported receiving destinations while retaining the seller/admin RLS boundary and immutable payout destination snapshots. Migration 0038 is a source change only until separately reviewed and applied; it does not initiate payments or transfers.
