# Tunisian seller onboarding through iPay

## Required business rule

Tunisian sellers must open or link their iPay account through Algorea Bazaar's own referral URL/code. Do not substitute a generic iPay signup URL and do not invent a referral code.

The platform owner has not yet supplied the actual referral URL/code. Therefore, this integration is a pre-merge blocker for enabling Tunisian seller iPay onboarding and must remain disabled until the real value is supplied and verified.

## Configuration required

Before implementation can be completed:

1. Obtain the platform-owned referral URL/code from the Algorea Bazaar iPay account or directly from Audasoft.
2. Confirm in writing that the referral route attributes the seller's iPay registration to Algorea Bazaar.
3. Confirm which iPay account identifier can be collected safely from sellers.
4. Confirm seller eligibility, supported countries, settlement currency, transfer limits, and current fees.
5. Confirm whether the platform can manually transfer each seller's post-commission proceeds weekly.
6. Confirm which party is charged for each transfer/withdrawal fee and how that fee is disclosed before the transfer.

## Payout policy

- Platform commission: 5% by default, configurable by an authorized administrator.
- Seller proceeds: sale amount less the platform commission.
- Seller payouts: planned as manual weekly transfers.
- iPay, bank, transfer, and withdrawal fees charged to the seller remain the seller's responsibility; they are separate from platform commission.
- Do not record or reimburse provider fees as platform expenses.
- Do not activate live payments or transfers until sandbox verification and explicit platform-owner approval.

## International sellers

The current order and pricing model is TND-based and the current iPay referral route is intended for Tunisian sellers. International seller onboarding and multi-currency settlement require a separately verified provider and country-coverage policy. Do not represent international payouts as available until those pieces are implemented and tested.
