# Tunisian seller onboarding through iPay and Konnect

## Referral and registration route

The planned referral code is **the platform owner's own Konnect account referral code**, not an iPay-issued referral code. The intended arrangement is to use that Konnect referral route for Tunisian seller registration within the iPay/Konnect payment setup.

The platform owner's Konnect referral details have now been supplied:

- Referral code: `31XyM7MR8wy71ga7a`
- Registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a

Use this exact Konnect link for Tunisian seller registration. It is a Konnect referral link, not an iPay-issued referral code. Before enabling it in the live seller onboarding flow, verify with Konnect/iPay that it correctly attributes registrations to the platform owner's account and confirm how each seller's resulting account is identified and linked to their Algorea Bazaar seller profile. Do not alter the code or construct a different referral URL.

## Items to verify before enabling seller payouts

1. Confirm the official registration steps and eligibility requirements for Tunisian sellers using the platform owner's Konnect referral code.
2. Confirm how a seller's Konnect/iPay account is identified and linked safely to their Algorea Bazaar seller profile.
3. Confirm whether the platform can manually transfer each seller's post-commission proceeds weekly.
4. Confirm supported settlement currency, transfer limits, processing times, and current fees.
5. Confirm which party is charged for each transfer/withdrawal fee and how that fee is disclosed before the transfer.
6. Document seller support and reconciliation, including transfer references and payout history.

The referral route is a configuration prerequisite for the planned Tunisian seller registration flow. It is not permission to activate live payments or payouts.

## Payout policy

- Platform commission: 5% by default, configurable by an authorized administrator.
- Seller proceeds: sale amount less the platform commission.
- Seller payouts: planned as manual weekly transfers, only after the account-linking and transfer process is verified.
- iPay, Konnect, bank, transfer, and withdrawal fees charged to the seller remain the seller's responsibility; they are separate from platform commission.
- Do not record or reimburse provider fees as platform expenses.
- Do not activate live payments or transfers until the workflow has been verified and the platform owner has explicitly approved activation.

## International sellers

The current order and pricing model is TND-based. Do not assume that a Konnect referral route or iPay/Konnect setup supports sellers outside Tunisia. International seller onboarding and multi-currency settlement require separately verified provider coverage and a country-specific policy. Do not represent international payouts as available until those pieces are implemented and tested.
