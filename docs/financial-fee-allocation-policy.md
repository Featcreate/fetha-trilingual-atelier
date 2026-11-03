# Algorea Bazaar — External Fee Allocation Policy

**Status:** Approved product requirement  
**Scope:** Buyer collections, payment processing, currency conversion, settlement, seller transfers and withdrawals

## 1. Platform commission

Algorea Bazaar charges a platform commission of **5% by default, configurable by an authorized platform administrator**. The commission is calculated and accounted for separately from every external fee.

The applicable commission rate is snapshotted on each order item. A later commission change applies only to new transactions and never recalculates completed or existing orders.

External fees must never be merged into, deducted from, or used to reduce the platform commission.

## 2. Buyer collection

- The buyer pays the displayed product/order price through a payment method enabled by Algorea Bazaar.
- External payment-processing, conversion and settlement charges are allocated to the seller, not added to the buyer's checkout total as a separate buyer fee.
- The provider's actual charge and settlement records must be reconciled before the seller's final payable amount is confirmed.
- This allocation must be implemented only where permitted by the provider's merchant terms and applicable law. If a provider does not permit this arrangement, keep that provider/payment method disabled until a compliant arrangement is established.

## 3. Seller responsibility for external fees

The seller bears **all external fees attributable to the sale and receipt of the seller's proceeds**, including where charged to the platform's collection/settlement account:

- payment gateway and card-processing fees;
- payment collection and transaction fees;
- currency conversion and FX fees;
- provider settlement fees;
- bank, wallet and transfer fees for sending seller proceeds;
- receiving, withdrawal and cash-out fees;
- other third-party charges directly attributable to processing, settling or transferring the seller's sale proceeds.

These fees are separate from the 5% platform commission. The platform does not absorb, reimburse, or treat them as a platform operating expense.

A fee may be allocated to a seller only using the actual fee charged and a documented, consistently applied allocation method. For a shared order-level fee, the administrator enters the actual total and the paid order ID; Algorea Bazaar allocates the fee proportionally to each seller's discounted paid order-item payable amount, using largest-remainder rounding so the allocated amounts sum exactly to the provider fee. Seller-specific fees are recorded against the relevant store only.

No fee may be guessed, presented as exact without a current verified fee schedule, or deducted twice. The seller-facing statement must show the sale amount, 5% commission, each external fee (or clearly identified allocated share), and final payable amount separately.

## 4. Seller proceeds and payouts

- Algorea Bazaar alone calculates, authorizes, initiates and records seller payouts.
- The seller's provisional amount after commission is reduced by the seller's verified external fees to determine the final payable amount.
- Seller payables and fee allocations are recorded in the platform's internal financial ledger with separate entries and references.
- During Phase 1, seller accounting and payouts are denominated in TND.
- The default cadence is a weekly manual transfer from the platform's own funds.
- The transfer amount is the seller's final payable after commission and verified seller-borne external fees. Any additional receiving/transfer/withdrawal fee is also borne by the seller and must be disclosed.
- An administrator records the transfer reference only after the platform has actually completed the transfer.
- No payment provider, gateway, or intermediary may split payments, create seller balances, or distribute seller proceeds directly.

## 5. Fee accuracy and transparency

- Use only actual provider/bank fee records or a current verified fee schedule.
- Keep each external fee separate from the 5% commission and from the seller's gross sale amount.
- Show the fee category, amount, currency, conversion basis where relevant, and allocation method in the seller's statement before payout confirmation.
- Do not silently reduce a seller's payable. The seller must be able to reconcile gross sales, commission, external fees, adjustments and final payable.
- If the provider charges fees to the platform account and the actual fee cannot be identified or allocated accurately and lawfully, keep the relevant payment/payout method disabled until resolved.

## 6. Implementation and activation gate

Implementation status: migrations 0023 and 0024 are applied to the original Supabase project. The administrator can record an actual external fee in TND only when a provider/bank statement or receipt reference is supplied. The fee is stored in an append-only seller fee register and the central platform ledger. Seller dashboards show each fee and its outstanding/allocated amounts. The weekly payout preparation function allocates each outstanding fee once, snapshots the fee total, and deducts it from the seller's final transfer amount after the platform commission. If verified fees exceed available seller proceeds, payout preparation is blocked and the fees remain outstanding for a later payout.

Automatic provider API ingestion is **not** implemented; fee totals must currently be entered by an administrator from actual evidence. Shared order-level fee splitting is calculated automatically from the verified paid order ID. No estimates or guessed rates are accepted. The current workflow records TND amounts only; non-TND fees must not be entered until their actual TND settlement conversion is evidenced.

This policy does **not** authorize live payment activation. Before enabling a provider, confirm its merchant terms permit the seller-borne fee arrangement, and verify its fee schedule, settlement timing, refunds/chargebacks, currency behavior and API/webhook reconciliation. Checkout remains fail-closed pending provider verification and sandbox reconciliation.
