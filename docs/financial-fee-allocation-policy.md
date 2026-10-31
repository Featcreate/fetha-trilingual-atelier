# Algorea Bazaar — External Fee Allocation Policy

**Status:** Approved product requirement  
**Approved:** 2026-10-31  
**Scope:** Buyers, sellers, payment methods, payouts, transfers, and withdrawals

## 1. Platform commission

Algorea Bazaar charges a platform commission of **5% of the product sale amount**. This commission is calculated and accounted for separately from all third-party fees.

External provider fees must never be absorbed by the platform or deducted from the platform's 5% commission.

## 2. Buyer-side fees

The buyer is responsible for the external fee charged by the payment method the buyer chooses.

Before the buyer confirms payment, the checkout must:
- identify the selected payment provider/method;
- show the actual external fee separately from the product amount and platform commission;
- show the total amount the buyer will pay.

A buyer-side fee may only be passed through where the provider's contract and applicable law permit it. Never invent, estimate as exact, or hard-code a provider fee without a current, verified fee schedule.

## 3. Seller-side fees

The seller is responsible for external fees associated with:
- receiving seller proceeds;
- transferring seller proceeds to the seller;
- withdrawing funds from the seller's account.

Seller payouts are planned as **manual weekly transfers**. The seller's sale entitlement is calculated after the 5% platform commission and before the seller's own external transfer/withdrawal fees. Those fees are borne by the seller and must not become a platform expense.

Where a provider deducts a fee from the transfer amount, the seller must be informed of the fee and the expected amount received before the payout is initiated, to the extent the provider exposes that information. Any fee recovery or deduction must comply with provider terms and applicable law.

## 4. No platform-paid external fees

Algorea Bazaar must not pay or reimburse fees charged by iPay, another payment gateway, a bank, a transfer service, or a withdrawal service. This includes buyer payment fees and seller receiving, transfer, and withdrawal fees.

If a provider charges fees to the platform's own account and does not support a lawful, transparent way to assign those fees to the responsible buyer or seller, that provider/method must remain disabled until a suitable arrangement is confirmed.

## 5. Transparency and accounting

- Show external fees as separate line items; do not merge them into the platform commission.
- Disclose the responsible party and fee before the relevant party confirms the transaction.
- Do not apply hidden fees.
- Do not book third-party fees as Algorea Bazaar expenses.
- Keep provider fees separate from seller gross proceeds, platform commission, and seller payout records.
- Do not assume a particular iPay rate, cap, referral program, or payout capability without current written confirmation from Audasoft.

## 6. Activation gate

This policy does **not** authorize live payment activation. Before enabling any payment or payout method, confirm its current fee schedule, who is contractually charged, whether fee pass-through is permitted, how the fee is calculated and displayed, and how seller payouts work. Test in sandbox first and obtain explicit approval before live activation.

No database migration, payment-provider connection, credential change, or live payment activation is implied by this policy document.
