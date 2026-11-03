# Algorea Bazaar — External Fee Allocation Policy

**Status:** Approved product requirement  
**Scope:** Worldwide buyers, Phase 1 Tunisia-based sellers, payment methods, platform accounting, and seller payouts

## 1. Platform commission

Algorea Bazaar charges a platform commission of **5% by default, configurable by an authorized platform administrator**. The commission is calculated and accounted for separately from all third-party fees.

The applicable commission is snapshotted on each order item. A later commission change applies only to new transactions and never recalculates completed or existing orders.

External provider fees must never be merged into or silently deducted from the platform commission.

## 2. Buyer collection and provider role

- Buyers may be located worldwide, subject to the selected provider's actual supported countries, cards, currencies, fraud controls, and applicable law.
- The payment provider collects the buyer's payment for Algorea Bazaar and settles the collection to the platform's own merchant/settlement account.
- The provider is a payment collection and settlement rail only. It must not split payments, create seller balances, hold seller funds on the platform's behalf, or transfer seller proceeds directly.
- Algorea Bazaar's internal accounting system is the sole authority for recording collections, calculating commission, determining seller payables, and recording seller payouts.
- A provider is not accepted for production unless it confirms in writing that this platform-owned collection model is supported for a digital multi-vendor marketplace.

## 3. Currency and FX accounting

- Product prices and canonical seller accounting remain in TND during Phase 1 because the initial seller cohort is in Tunisia.
- A buyer may be charged in another currency only when the selected provider confirms that currency and the actual settlement behavior.
- For every foreign-currency order, retain an immutable snapshot of the buyer charge currency and amount, the platform settlement currency and actual settled amount, the FX rate, its source, and its timestamp.
- The accounting rate used for the order must be a verified checkout/settlement rate, not an informational rate used to display approximate prices.
- Calculate the 5% platform commission and seller payable from the canonical TND accounting amount, with a documented rounding rule. Never recalculate historical orders using a newer FX rate.
- Reconcile the buyer charge, provider settlement, provider fee, platform commission, seller payable, and any FX difference as separate accounting entries.

## 4. Seller proceeds and payouts

- The seller's payable amount is calculated by Algorea Bazaar after the platform commission.
- Seller payables are recorded in the platform's internal financial ledger. This ledger is an accounting record, not a bank account, stored-value wallet, or payment instrument.
- During Phase 1, seller payouts are denominated in TND and initiated only by Algorea Bazaar from the platform's own funds.
- The default cadence is a weekly manual transfer. An administrator records the transfer reference only after the platform has actually completed the transfer.
- No payment provider, gateway, or intermediary may distribute, split, or directly pay seller proceeds. No automatic seller payout is enabled.

## 5. External fees and transparency

- Payment, conversion, settlement, bank-transfer, and withdrawal fees remain separate from the 5% platform commission.
- Allocate each fee only to the party contractually and legally responsible for it. The responsible party and exact known fee must be disclosed before confirmation where applicable.
- Never invent, estimate as exact, or hard-code a provider fee without a current verified fee schedule.
- Do not silently reduce a seller's recorded payable or the platform commission to cover provider charges.
- If the provider charges fees to the platform account and the fee allocation cannot be lawfully and transparently resolved, keep that provider/method disabled until the commercial arrangement is confirmed.

## 6. Activation gate

This policy does **not** authorize live payment activation. Before enabling a provider, confirm its support for worldwide buyers, foreign-currency charge and TND settlement behavior, marketplace/digital-goods model, actual fee schedule, settlement timing, refunds/chargebacks, and webhook/API verification. Test in sandbox and obtain explicit approval before live activation.

No production database migration, payment-provider connection, credential change, or live payment activation is implied by this policy.
