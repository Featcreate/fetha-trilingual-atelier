# Algorea Bazaar — seller payout operations

## Approved operating model

Algorea Bazaar alone calculates, owes, authorizes, initiates, and records seller payouts. Payment providers are used only to collect buyer payments and settle those collections to the platform's own merchant/settlement account.

- Phase 1 seller onboarding is for sellers in Tunisia. Worldwide buyer access does not mean worldwide seller payout coverage.
- Seller registration, store creation, and product listings remain free. No registration, store-opening, listing, or mandatory seller subscription fee is charged.
- The platform commission is 5% by default and administrator-configurable. Each order item snapshots its commission rate and amounts; historical snapshots are never recalculated.
- After verified collection and settlement, the platform records the sale, commission, and seller payable in its internal financial ledger.
- Bank transfer is the only seller receiving method currently offered in the seller dashboard. The data model remains extensible so additional methods can be introduced in a separate future change. Weekly manual transfer is the platform's settlement cadence.
- The seller's name, account identifier, provider/bank and optional routing notes are stored as private payout details. Passwords, PINs, OTPs and API secrets must never be collected.
- Each payout batch snapshots the selected destination. Editing the seller's preference affects future batches only; it cannot redirect an existing batch.
- During Phase 1, seller payables and transfers are denominated in TND.
- The platform operator transfers the seller's recorded payable from the platform's funds to the seller's selected destination. Only actual transfer fees supported by a statement or transaction reference are recorded, allocated, and deducted separately from platform commission; tariff estimates, assumed VAT, and unsupported beneficiary-side fees are not deducted.
- An administrator records the transfer reference and marks the payout paid only after the real transfer has succeeded.
- The admin confirmation action is an accounting record only; it does not itself send money.
- Every payout batch has a unique idempotency key. Each verified sale ledger entry can belong to at most one payout batch. Failed transfers remain recorded and must not be silently released for duplicate payment.
- Sellers can view their payout history, transfer references, the payable before actual transfer fees, the evidenced fee total, and the net amount transferred. Administrators can view the destination snapshot needed to complete each manual transfer.

## Provider restrictions

- No provider may split a buyer payment or send seller proceeds directly.
- No provider API is used to initiate seller payouts.
- Buyer-collection providers are separate from seller payouts. They do not control seller balances or distribute marketplace proceeds; Algorea Bazaar manages seller payables and manual bank transfers.
- Do not collect or store seller payment-provider passwords, OTPs, or private credentials.
- Do not promise a seller payout route until the platform has verified the seller's destination details and lawful transfer method.

## Buyer collection and FX

- Buyers may purchase from any country, subject to the selected payment provider's confirmed coverage.
- The provider must settle buyer collections to the platform's own merchant/settlement account.
- Product prices and seller accounting remain TND during Phase 1. If a buyer is charged in a foreign currency, preserve the exact buyer amount/currency and the provider's actual settlement amount/currency with the FX rate, source, and timestamp.
- Calculate commission and seller payable from the canonical TND accounting amount. Informational exchange-rate displays are not accounting evidence.
- Reconcile provider fees and FX differences separately. Allocate all verified external fees attributable to the sale to the seller; never hide them inside the 5% commission.
- For shared order-level fees, allocate proportionally to each seller's attributable paid order amount unless provider evidence identifies the seller-specific amount.
- Calculate seller payables from verified sales after the applicable platform commission. Keep buyer-collection and order-processing fees distinct from seller-transfer fees; only evidenced `seller_transfer` entries are deducted at payout. The seller payout statement shows the payable before transfer fees, evidenced transfer fees, net payout, status, and transfer reference.

## Payment activation safety

- Checkout remains disabled until a provider confirms in writing that it supports worldwide buyers, the platform-owned collection model, digital multi-vendor sales, the required currencies, and settlement to the platform's account.
- Provider API credentials alone do not enable checkout. Sandbox verification, fee disclosure, webhook/status verification, refund/chargeback handling, and explicit approval for live activation are required.
- No provider connection, automatic payout, live payment, or production deployment is authorized by this document.

## Weekly operating procedure

1. Reconcile verified paid sales and seller ledger entries for the weekly period.
2. Prepare the weekly payout batch. The platform calculates the seller's payable after platform commission and deducts only actual, evidence-backed `seller_transfer` fees recorded against the seller. UIB tariff values are internal reference values, not proof of a fee charged.
3. Review gross sales, discounts, platform commission, evidenced transfer fees, and final net seller payable.
4. Transfer the displayed payable from the platform's own funds to the seller's saved receiving destination.
5. After the transfer succeeds, record the transfer reference and confirm the payout. If the transfer fails, record the reason and retry the same payout; do not create a second batch for the same sales.

## Database rollout

Migrations 0022, 0023 and 0024 have been applied to the original Supabase project. Migration 0023 originally added the append-only seller external-fee register, fee-allocation records, administrator-only fee recording, and fee-aware payout snapshots; migration 0031 temporarily superseded the payout deduction behavior, and migration 0052 restores deductions only for actual, evidence-backed `seller_transfer` fees. Migration 0024 adds indexes for the remaining legacy fee-table foreign keys. Migration 0025 adds automatic proportional allocation for shared order-level fees in the legacy fee-recording workflow. The database currently contains zero orders, seller fee records, fee allocations, payouts, or platform ledger entries. Checkout and live payment activation remain disabled.

## Seller destination and batch snapshots

Migration 0030 introduced seller-selected receiving destinations independently from the weekly manual settlement rail. Migration 0031 temporarily superseded the earlier fee-aware payout calculation; migration 0052 restores deductions only for actual, evidence-backed `seller_transfer` fees. The seller-facing payout form currently offers bank transfer only. The destination model remains extensible for additional methods in a future change.

## Evidence-based payout fees and minimum

- The minimum net payout is **50.000 TND or more** (50,000 millimes); exactly 50.000 TND is eligible.
- Platform commission is calculated separately and is never combined with transfer fees.
- Only a fee actually charged and supported by an external statement or transaction reference may be recorded and allocated to a seller payout. Do not deduct an estimated tariff, assumed VAT, or a beneficiary-side incoming fee without evidence that it is borne by the platform's transfer operation.
- The internal UIB tariff reference may guide review of a bank charge, but it is not itself proof that the charge was applied. The seller-facing statement shows the amount before fees, fees, and net amount only; it does not expose the bank name or transfer category.
- Migration 0052 restores the existing append-only, evidence-backed fee allocation path for new payout batches. It does not automatically execute transfers or apply a tariff estimate.

### Internal UIB tariff reference (HT)

The administrator's internal transfer-class selector displays these reference values: digital transfer to a UIB account, 2.000 TND; digital transfer to another Tunisian bank, 2.500 TND; branch transfer to a UIB account, 3.000 TND; branch transfer to another Tunisian bank, 3.500 TND; multiple transfer using electronic support, 30.000 TND per operation; manual-list transfer to a UIB beneficiary, 1.200 TND per beneficiary; manual-list transfer to another bank, 1.500 TND per beneficiary. The 30.000 TND electronic-batch rate is not selectable in the per-seller fee form because a shared operation fee must first be allocated across all affected sellers; it must never be charged in full to one seller by default. It is not combined with either manual-list per-beneficiary rate. The selector is an internal classification only: the administrator must enter the actual debit amount and external statement reference. VAT is not added automatically.
