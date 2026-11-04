# Algorea Bazaar — Global buyer payment route

**Status:** Technical route prepared; provider and live checkout not approved.

## Marketplace scope

- Buyers may shop worldwide, subject to provider country/card coverage, sanctions controls, fraud rules and applicable law.
- Phase 1 sellers are based in Tunisia. This does not imply global seller onboarding or international seller payouts.
- Algorea Bazaar is the merchant-facing collection beneficiary. All seller balances, commission calculations and payouts remain inside the platform's own accounting and admin workflow.
- No provider-side split, submerchant wallet, direct seller payout or automatic payout is allowed.
  Seller payout destinations are stored separately and paid manually by Algorea Bazaar.

## Leading provider candidate: Konnect

Konnect is currently the strongest publicly documented candidate for the initial international-card route:
- Its official site says it accepts international Visa and Mastercard cards and settles collections to the merchant's bank account.
- Its API supports hosted checkout, payment status lookup, webhooks and a sandbox.
- Its public API documents TND, EUR and USD charge tokens; non-TND payments are automatically converted.
- Its public pricing page lists indicative fees of 1.3% for Tunisian cards/e-Dinar and 2.9% for international cards. The signed merchant agreement takes precedence.

Official references:
- https://pay.konnect.network/
- https://docs.konnect.network/docs/en/api-integration/endpoints/initiate-payment
- https://docs.konnect.network/docs/en/api-integration/endpoints/get-payment-details
- https://docs.konnect.network/docs/en/api-integration/endpoints/webhook
- https://pay.konnect.network/pricing/

## Current technical behavior

- The existing server-side Konnect adapter is retained as the primary buyer-collection candidate.
  Paymee may be evaluated as an alternative only after its merchant terms, marketplace eligibility,
  settlement route, fees, coverage and API behavior are verified.
- Hosted checkout requests use the platform's Konnect receiver wallet ID from server-side environment configuration; no secret is stored in the browser or committed to GitHub.
- The canonical order and seller accounting currency is TND.
- The current request sends TND. International Visa/Mastercard cardholders may see a conversion by their card issuer into their card billing currency. Algorea Bazaar does not yet charge the buyer in their local currency.
- Bank card is listed first in accepted methods; local wallet and e-DINAR methods remain available where the provider supports them.
- Payment confirmation is checked server-to-server against Konnect's payment-details API; both the completed payment status and at least one successful transaction status are required, and browser return parameters are not trusted.
- The settlement RPC is the only route that marks an order paid and grants download entitlements.
- Payment activation remains fail-closed. No credentials, live charges, or provider connection are activated by this code change.

## Conditions required before activation

Obtain written confirmation from Konnect that:
1. Algorea Bazaar may act as the sole merchant/collection beneficiary for a multi-vendor marketplace selling downloadable digital products supplied by independent Tunisian sellers.
2. All buyer funds are credited/settled to the platform's own account; Konnect does not split, hold or distribute seller proceeds.
3. International Visa/Mastercard payments are accepted from the countries the marketplace intends to serve, with all relevant country, card, sanctions and risk restrictions disclosed.
4. The platform's merchant account may be used for the exact business model and website/domain.
5. Settlement currency, bank transfer timing, reserve/hold rules, fees, refund/chargeback process and liability are documented.
6. The API's amount fields, convertedAmount/exchangeRate behavior, transaction currency and settlement reports are clear for TND, EUR and USD.
7. The effect of addPaymentFeesToAmount is confirmed so the buyer-facing fee disclosure and amount verification can be implemented without reconciliation errors.
8. Digital goods, instant downloads, software/apps and multi-seller fulfilment are not excluded by the merchant agreement or acceptable-use rules.

## Currency policy

- Until the provider confirms and sandbox-tests foreign-currency charges and settlement, checkout remains TND-only.
- The displayed USD/EUR catalogue equivalents are informational and must never be used as a payment quote.
- If EUR/USD checkout is later enabled, each order must snapshot the buyer charge currency/amount, the provider's actual settlement currency/amount, the conversion rate, source and timestamp. Seller commission and payable remain calculated from the canonical TND order value.
- No historic order may be repriced using a later FX rate.

## Fee policy

The public Konnect fee schedule is indicative. Do not silently absorb or pass on fees. Confirm the exact merchant agreement and the provider behavior for buyer-paid fees. The current API setting has not been changed until the effect on amountDue/reachedAmount and settlement reconciliation is proven in sandbox. Fees remain separate from the platform's 5% commission.

## Alternatives

- iPay publicly describes an aggregator of Tunisian payment methods and marketplace/SaaS integrations. Public information reviewed does not establish a worldwide international-card checkout route suitable for this marketplace.
- WePay publicly advertises local and international checkout, but its published pricing page says cross-border payment methods are not yet available and lists foreign cards through ClicToPay separately. Obtain a current written commercial and technical confirmation before considering it a fallback.
- Neither alternative is connected to buyer checkout.

## Release gates

1. Written provider acceptance for this marketplace model.
2. Confirm platform-owned merchant/settlement account and fee/FX terms.
3. Configure server-only sandbox credentials.
4. Complete sandbox tests for local and international cards, webhooks, duplicate notifications, partial/failed/expired payments, amount mismatch, refunds and reconciliation.
5. Migration 0022 is applied to the original Supabase project and verified against the live schema with a transaction-wrapped dry run before application. A full disposable migration-chain test remains unavailable because the separate test project is empty.
6. Obtain separate explicit approval before any live payment activation.
