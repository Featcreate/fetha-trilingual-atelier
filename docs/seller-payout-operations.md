# Algorea Bazaar — seller payout operations

## Approved operating model

Algorea Bazaar alone calculates, owes, authorizes, initiates, and records seller payouts. Payment providers are used only to collect buyer payments and settle those collections to the platform's own merchant/settlement account.

- Phase 1 seller onboarding is for sellers in Tunisia. Worldwide buyer access does not mean worldwide seller payout coverage.
- Seller registration, store creation, and product listings remain free. No registration, store-opening, listing, or mandatory seller subscription fee is charged.
- The platform commission is 5% by default and administrator-configurable. Each order item snapshots its commission rate and amounts; historical snapshots are never recalculated.
- After verified collection and settlement, the platform records the sale, commission, and seller payable in its internal financial ledger.
- Sellers select their own receiving destination (iPay, WePay, bank transfer, or another supported method). Weekly manual transfer is the platform's settlement cadence, not a seller receiving destination.
- The seller's name, account identifier, provider/bank and optional routing notes are stored as private payout details. Passwords, PINs, OTPs and API secrets must never be collected.
- Each payout batch snapshots the selected destination. Editing the seller's preference affects future batches only; it cannot redirect an existing batch.
- During Phase 1, seller payables and transfers are denominated in TND.
- The platform operator transfers the seller's final recorded payable from the platform's funds to the seller's own account. The seller bears all verified external fees attributable to payment processing, collection, conversion, settlement, transfer and withdrawal. These fees are shown separately from the 5% commission and deducted from the seller's proceeds only once, using actual provider/bank evidence and a documented allocation method.
- An administrator records the transfer reference and marks the payout paid only after the real transfer has succeeded.
- The admin confirmation action is an accounting record only; it does not itself send money.
- Every payout batch has a unique idempotency key. Each verified sale ledger entry can belong to at most one payout batch. Failed transfers remain recorded and must not be silently released for duplicate payment.
- Sellers can view their payout history, recorded transfer references, the receiving method used for each batch, and their itemized external-fee deductions. Administrators can view the destination snapshot needed to complete each manual transfer.

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
- Do not finalize or transfer a seller payable until the actual external fee amount and allocation are supported by provider/bank evidence. The seller statement must show gross sales, 5% commission, each fee allocation, and final payable.

## Payment activation safety

- Checkout remains disabled until a provider confirms in writing that it supports worldwide buyers, the platform-owned collection model, digital multi-vendor sales, the required currencies, and settlement to the platform's account.
- Provider API credentials alone do not enable checkout. Sandbox verification, fee disclosure, webhook/status verification, refund/chargeback handling, and explicit approval for live activation are required.
- No provider connection, automatic payout, live payment, or production deployment is authorized by this document.

## Weekly operating procedure

1. Reconcile the provider/bank statement and identify actual fees attributable to the seller. Do not use estimates.
2. In the administrator dashboard, record each actual fee with its category, TND amount, statement/receipt reference, and description. For a fee covering a specific paid order, enter the order ID so the system allocates the total proportionally to each seller's discounted paid amount. For a seller-specific charge, select that seller's store.
3. Prepare the weekly payout batch. The database allocates each outstanding fee once and calculates the final transfer as verified seller proceeds after the 5% commission and the fee snapshot.
4. Review gross sales, discount, commission, external fees, and final payable. If fees exceed available proceeds, the system blocks payout preparation and carries the fees forward.
5. Transfer the displayed final payable from the platform's own funds using the approved external transfer method.
6. After the transfer succeeds, record the transfer reference and confirm the payout. If the transfer fails, record the reason and retry the same payout; do not create a second batch for the same sales.

## Database rollout

Migrations 0022, 0023 and 0024 have been applied to the original Supabase project. Migration 0023 adds the append-only seller external-fee register, fee-allocation records, administrator-only fee recording, and fee-aware payout snapshots. Migration 0024 adds indexes for the remaining fee-table foreign keys. Migration 0025 adds automatic proportional allocation for shared order-level fees with exact largest-remainder rounding. The database currently contains zero orders, seller fee records, fee allocations, payouts, or platform ledger entries. Checkout and live payment activation remain disabled.

## Seller destination and batch snapshots

Migration 0030 introduces seller-selected receiving destinations independently from the weekly manual settlement rail. It changes the preference method to a constrained destination value (iPay, WePay, bank transfer, or other), stores the account holder and receiving identifier under the existing seller/admin RLS boundary, and snapshots the destination into each payout batch. The payout-creation RPC refuses to create a batch until the seller has saved the required destination details. The snapshot is immutable and the administrator dashboard displays it for the manual transfer.

Migration 0030 is present in the GitHub implementation branch for review. It has **not** been applied to the test or production Supabase projects. No payment, payout, or deployment has been activated by this change.
