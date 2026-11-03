# Seller payment-provider links — Phase 1

## Scope

Worldwide buyers may purchase from Algorea Bazaar, subject to the selected buyer-payment provider's coverage. Phase 1 seller onboarding is limited to sellers in Tunisia.

The seller-facing Konnect, iPay, and WePay buttons are external information/account links only. They do not connect a seller account to Algorea Bazaar, receive buyer payments, calculate seller balances, or execute payouts.

## Platform-owned financial flow

- Buyer payments are collected for Algorea Bazaar and settled to the platform's own merchant/settlement account.
- The platform alone records the collection, commission, seller payable, and payout obligation.
- Platform commission is 5% by default and configurable by an authorized administrator.
- The default seller payout method is a weekly manual transfer initiated by Algorea Bazaar from the platform's own funds.
- No payment provider may split a buyer payment or send seller proceeds directly.
- No direct Konnect wallet payout, automatic split, iPay payout, or WePay payout is enabled or part of the approved model.

## Seller-facing links

The seller workspace may display the following external links as optional information:

- Konnect: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a
- iPay: https://www.ipay.tn/
- WePay: https://we-pay.io/en/home/

These links do not imply provider approval, a commercial agreement, account linking, or an available payout route. Do not collect or store provider passwords, OTPs, API secrets, or private credentials.

## Activation checks

Before selecting a provider for buyer checkout, verify its worldwide buyer coverage, digital-goods/multi-vendor acceptance, platform-owned collection and settlement, currencies, fees, refunds/chargebacks, API/webhook verification, and sandbox behavior. Seller payout execution remains separate and exclusively platform-controlled.

No live payments, provider connection, automatic payouts, or production deployment is authorized by this document.
