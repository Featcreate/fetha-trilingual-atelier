# iPay integration readiness — Algorea Bazaar

Last reviewed against the public iPay by Audasoft website: 2026-11-07.

## Scope and invariants

- iPay is the selected provider for planned buyer checkout.
- Keep the existing Konnect integration intact; do not remove it or silently reroute it.
- Do not enable live checkout as part of this preparation.
- Buyer payments are collected into the platform's iPay organisation/account. Do not use split payments or provider-managed seller payouts.
- Keep TND order accounting, commission calculation, the append-only platform ledger, seller balances, and weekly manual seller payouts unchanged.
- Release a digital download only after authoritative confirmation of the exact transaction, order association, amount, currency, and final payment state.
- Never commit API tokens/JWTs or other provider secrets. Store them only as server-side deployment secrets after the integration contract is confirmed.

## Public information verified on ipay.tn

### API and checkout

- Public developer page documents API base authentication headers: `X-Org-Id` and `Authorization: Bearer <JWT>`; token is stated to be valid for one year.
- Public developer page lists `GET /api/admin/transactions` for listing transactions.
- Public one-shot page explicitly describes e-commerce/m-commerce: `POST /api/admin/transactions/create-oneshot`, one transaction per order, returning a payment link for redirect. It says the buyer chooses a method on iPay.
- The public pages do not publish the full create-oneshot request/response schema; the detailed API documentation is stated to be available inside the authenticated dashboard. The field list previously recorded in this project came from the user-provided authenticated documentation, not independently verifiable public page content.

### Payment methods and geography

- Public aggregator page lists bank transfer, postal mandate, ClicToPay, Flouci, D17, Konnect, Ooredoo SMS, Tunisie Telecom SMS, and WinSMS.
- The public page describes these as solutions covering the Tunisian payment ecosystem. ClicToPay is described as a Tunisian-bank card gateway.
- The public information reviewed does **not** establish that international-issued cards are accepted, that non-TND buyer charges are supported, or that settlement is available in foreign currencies. Do not advertise worldwide card acceptance until Audasoft confirms supported card schemes/issuing countries, currency, and settlement.
- The public website and the organisation dashboard both show iPay pricing of 1% per transaction, capped at 5 TND, billed monthly; the dashboard currently shows no transaction/commission entries. The public pricing page says third-party provider fees (e.g. ClicToPay, Flouci, SMS) may be charged in addition, while bank transfer and postal mandate have no additional iPay-side surcharge beyond the 1% capped commission. Confirm the precise tariff and all external/acquirer fees for this organisation, refunds, and every enabled method before financial modelling.

### Webhooks — important inconsistency and risk

- Public webhook page says events are sent by POST JSON to product-configured URLs; it advertises call history/payload history and automatic retry.
- The same page says `transaction.completed` can be triggered when a customer declares a bank transfer or postal mandate, when an administrator manually changes status to paid, and when a gateway callback confirms payment.
- Public one-shot page also describes `transaction.completed` for card, declared transfer, Flouci, and SMS.
- This means the event name alone does not prove that funds have cleared or are available to the platform. Treat bank/postal declarations as unverified until the merchant can confirm actual receipt.
- There is a documentation conflict: the authenticated API notes supplied by the user previously stated that iPay does **not** retry failed webhook deliveries, while the current public webhook page advertises automatic retry. Do not rely on retries until Audasoft confirms the actual behaviour for this organisation/API version. The receiver must be idempotent regardless.
- The public pages reviewed do not specify a webhook signature/HMAC scheme or provide an authoritative transaction-by-ID verification endpoint/response schema. This is an absence in the public documentation reviewed, not proof that the capability does not exist.

## Provider contact status

- A one-question email was attempted to `support@ipay.tn` on 2026-11-07, asking whether `create-oneshot.amount` uses integer millimes or decimal dinars.
- Gmail returned a delivery failure: `554 5.7.1 Relay access denied`. The message did not reach iPay; no provider response or confirmation has been received.
- The published general/commercial contact is `contact@audasoft.co`. A follow-up to that alternate address has not been sent pending the account owner's approval.

## Required confirmation from Audasoft

1. **Amount units:** Is `amount` in TND millimes, decimal TND, or another convention? Provide a request/response example for exactly 10.500 TND.
1. **Authoritative transaction verification:** What endpoint and fields confirm one transaction's final paid/settled state, amount, currency, product code, transaction ID, and external order reference? Can `GET /api/admin/transactions` filter reliably by transaction ID or invoice/customer external reference?
1. **Webhook authenticity:** Is there a signature, HMAC, secret header, mTLS, or another authenticity mechanism? Provide exact verification instructions.
1. **Declared bank/postal transfers:** Does `transaction.completed` on a declared transfer mean funds are already credited/cleared, or only that the customer declared a transfer? Which status/event confirms actual receipt? Can these methods be disabled per product?
1. **International buyers:** Which card schemes and issuing countries are accepted? Are international-issued Visa/Mastercard supported through this organisation's ClicToPay configuration? Which currencies can be charged, and what currency reaches the platform?
1. **Webhook delivery:** The public page advertises automatic retry but the authenticated notes supplied earlier say no retry. Which is correct for this account/API version, what is the retry schedule, and how can missed events be replayed?
1. **Product configuration:** Confirm that product code `algorea-bazaar` is valid for one-shot transactions, and whether success/failure callback URLs are configured per product only or can be overridden per transaction.
1. **Marketplace eligibility and documents:** Confirm in writing that this organisation/account can process payments for a digital-goods marketplace where buyers pay the platform and the platform separately accounts for and manually pays sellers. Confirm any required business registration, KYC, or supporting documents.
1. **Fees:** Confirm the 1% monthly-billed commission capped at 5 TND for this organisation and identify every additional acquirer/provider fee by payment method, including refunds and declared transfers.

## Implementation status on feature/checkout-delivery-main-integration

The iPay one-shot client is now connected to the authenticated cart checkout path for payment-link testing:

- `src/lib/ipay.server.ts` builds the documented `POST /api/admin/transactions/create-oneshot` request using `X-Org-Id` and Bearer JWT headers.
- The checkout page selects iPay when its server-side configuration and activation flag are present; otherwise it preserves the existing Konnect path. The Konnect integration and its provider-specific fields remain intact.
- iPay transaction reference and hosted URL are stored separately in `orders.ipay_payment_ref` and `orders.ipay_payment_url`.
- `0044_ipay_checkout_init_claim.sql` adds an independent, owner-checked initialization claim. It blocks duplicate external attempts after an uncertain provider response and prevents mixing iPay with a Konnect attempt on the same order.
- `IPAY_AMOUNT_UNIT` is now required explicitly as either `major` or `minor`. The code no longer silently assumes millimes or decimal dinars.
- The new migration was applied only to the disposable test Supabase project `algorea-bazaar-test` (`iblfizhtvzfnfuntnazk`). The new column and RPC are present there; production Supabase was not changed.

This integration currently creates and persists an iPay payment link only. It does **not** yet verify final payment, process iPay webhooks, settle orders, post ledger entries, credit seller balances, or release downloads. A browser return or `transaction.completed` notification is not treated as proof of cleared funds. No real iPay transaction has been initiated yet.

## Implementation gate

Until the account's test-mode credentials and amount-unit convention are confirmed:

- keep `IPAY_CHECKOUT_ENABLED` unset or `false` on production;
- enable the feature only on the dedicated test service, using test credentials/product configuration from the iPay dashboard;
- set `IPAY_AMOUNT_UNIT` explicitly only after Audasoft confirms the convention or a controlled non-settling sandbox check establishes it;
- do not settle an order based only on a webhook, redirect, or browser query parameter;
- do not release downloads for declared bank/postal transfers without confirmed cleared funds;
- do not claim international-card or foreign-currency support;
- do not assume webhook authenticity or retry behaviour.

Next engineering steps: configure the dedicated test service with the iPay test organisation token and product code; verify that a small controlled test order is displayed in exactly the expected TND amount; then obtain Audasoft's authoritative transaction lookup and webhook-authenticity contract before implementing reconciliation, settlement, ledger posting, or download release.
