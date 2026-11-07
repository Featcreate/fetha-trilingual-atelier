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
- The public website advertises pricing of 1% per transaction, capped at 5 TND, with no fixed monthly fee. Confirm whether this tariff applies to this organisation, each method, declared transfers, refunds, and any special gateway fees before financial modelling.

### Webhooks — important inconsistency and risk
- Public webhook page says events are sent by POST JSON to product-configured URLs; it advertises call history/payload history and automatic retry.
- The same page says `transaction.completed` can be triggered when a customer declares a bank transfer or postal mandate, when an administrator manually changes status to paid, and when a gateway callback confirms payment.
- Public one-shot page also describes `transaction.completed` for card, declared transfer, Flouci, and SMS.
- This means the event name alone does not prove that funds have cleared or are available to the platform. Treat bank/postal declarations as unverified until the merchant can confirm actual receipt.
- There is a documentation conflict: the authenticated API notes supplied by the user previously stated that iPay does **not** retry failed webhook deliveries, while the current public webhook page advertises automatic retry. Do not rely on retries until Audasoft confirms the actual behaviour for this organisation/API version. The receiver must be idempotent regardless.
- The public pages reviewed do not specify a webhook signature/HMAC scheme or provide an authoritative transaction-by-ID verification endpoint/response schema. This is an absence in the public documentation reviewed, not proof that the capability does not exist.

## Required confirmation from Audasoft

1. **Amount units:** Is `amount` in TND millimes, decimal TND, or another convention? Provide a request/response example for exactly 10.500 TND.
2. **Authoritative transaction verification:** What endpoint and fields confirm one transaction's final paid/settled state, amount, currency, product code, transaction ID, and external order reference? Can `GET /api/admin/transactions` filter reliably by transaction ID or invoice/customer external reference?
3. **Webhook authenticity:** Is there a signature, HMAC, secret header, mTLS, or another authenticity mechanism? Provide exact verification instructions.
4. **Declared bank/postal transfers:** Does `transaction.completed` on a declared transfer mean funds are already credited/cleared, or only that the customer declared a transfer? Which status/event confirms actual receipt? Can these methods be disabled per product?
5. **International buyers:** Which card schemes and issuing countries are accepted? Are international-issued Visa/Mastercard supported through this organisation's ClicToPay configuration? Which currencies can be charged, and what currency reaches the platform?
6. **Webhook delivery:** The public page advertises automatic retry but the authenticated notes supplied earlier say no retry. Which is correct for this account/API version, what is the retry schedule, and how can missed events be replayed?
7. **Product configuration:** Confirm that product code `algorea-bazaar` is valid for one-shot transactions, and whether success/failure callback URLs are configured per product only or can be overridden per transaction.
8. **Marketplace eligibility and documents:** Confirm in writing that this organisation/account can process payments for a digital-goods marketplace where buyers pay the platform and the platform separately accounts for and manually pays sellers. Confirm any required business registration, KYC, or supporting documents.

## Implementation gate

Until the confirmations above are received:
- no live payment activation;
- no settlement based only on a webhook, redirect, or browser query parameter;
- no automatic download release for declared bank/postal transfers without confirmed cleared funds;
- no assumed amount-unit conversion or foreign-currency support;
- no assumed webhook authenticity or retry behaviour.

After the contract is confirmed, implement the iPay adapter and webhook/reconciliation flow on this branch, test in a non-live environment, and review the diff before any merge or deployment.
