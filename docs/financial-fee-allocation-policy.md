# Algorea Bazaar — External Fee Allocation Policy

**Status:** Approved product requirement  
**Approved:** 2026-10-31  
**Scope:** Buyers, sellers, payment methods, payouts, transfers, and withdrawals

## 1. Platform commission

Algorea Bazaar charges a platform commission of **5% of the commissionable sale amount** by default. The rate may be changed only by an authorized platform administrator, with notice before the new rate applies to future sales. At the 5% rate, the seller's entitlement is **95% of the commissionable sale amount**, before seller-side receiving, transfer, or withdrawal fees. The commission and seller entitlement are calculated and accounted for separately from all third-party fees.

The applicable commission must be disclosed clearly to sellers before a sale and reflected in the transaction breakdown. Any future change must be announced before it applies to new transactions. The rate is stored as a transaction snapshot, so a later change never recalculates completed or existing orders.

External provider, bank, payment, transfer, and withdrawal fees must never be paid, reimbursed, absorbed, or booked as an expense by Algorea Bazaar. Such fees must never reduce the platform's 5% commission.

## 2. Buyer-side fees

The buyer is the responsible party for any payment-method fee that the provider contract and applicable law permit to be charged to the buyer. The fee is additional to the product amount and is not deducted from the platform commission or seller's 95% entitlement. If buyer pass-through is not permitted or the exact fee cannot be reliably disclosed, do not activate that payment method.

Before the buyer confirms payment, the checkout must:

- identify the selected payment provider/method;
- show the actual external fee separately from the product amount and platform commission;
- show the total amount the buyer will pay.

A buyer-side fee may only be passed through where the provider's contract and applicable law permit it. Never invent, estimate as exact, or hard-code a provider fee without a current, verified fee schedule.

## 3. Seller-side fees

The seller is responsible for external fees associated with receiving, transferring, or withdrawing the seller's 95% entitlement. These seller-side fees are separate from the platform commission and must not be deducted from it. This includes fees associated with:

- receiving seller proceeds;
- transferring seller proceeds to the seller;
- withdrawing funds from the seller's account.

Seller payouts are planned as **manual weekly transfers**. All sellers, regardless of nationality or residence, are offered the same platform-owned Konnect referral-registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a. Algorea Bazaar does not apply a seller-country eligibility filter; Konnect alone decides whether it accepts each seller and what verification details it requires. The referral link does not guarantee acceptance, automatically link a seller wallet, or enable automatic payouts. Verify referral attribution, account identification/linking, manual transfer capability, and current payout terms before enabling any payout route. The seller's sale entitlement is calculated as 95% at the 5% commission rate (or the applicable future configured rate), after applicable discounts and before the seller's own external receiving/transfer/withdrawal fees. Those fees are borne by the seller and must not become a platform expense.

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
