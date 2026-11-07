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

## Implementation status on feature/ipay-checkout-integration

A first, deliberately incomplete server-side scaffold has been added:

- `src/lib/ipay.server.ts` implements authenticated one-shot request construction using the documented `X-Org-Id` and Bearer JWT headers.
- The one-shot client validates the order/customer input, requires `IPAY_CHECKOUT_ENABLED=true`, and rejects provider responses with empty references or checkout URLs outside HTTPS iPay domains (including URLs containing embedded credentials).
- `IPAY_AMOUNT_UNIT` defaults to `minor` (integer TND millimes); `major` remains an explicit override only if Audasoft confirms decimal dinars in writing. This is an adopted but unverified assumption, not an official confirmation.
- `drizzle/migrations/0034_ipay_checkout_reference.sql` adds separate nullable iPay reference/URL fields and a unique partial index. It does not alter the Konnect columns, order settlement, commission, ledger, or payout rules.
- `src/lib/ipay.server.test.ts` covers the pure TND amount conversion guard and hosted checkout URL/reference validation.

The iPay client is not yet wired into buyer checkout. No iPay webhook handler or settlement/reconciliation path has been added. This is intentional: the public material reviewed does not yet establish the authoritative status-verification contract or webhook authenticity, and the semantics of declared bank/postal transfers remain ambiguous.

## Implementation gate

Until Audasoft confirms the open questions above:

- do not set `IPAY_CHECKOUT_ENABLED=true`;
- do not apply migration 0034 to Supabase;
- do not settle an order based only on a webhook, redirect, or browser query parameter;
- do not release downloads for declared bank/postal transfers without confirmed cleared funds;
- keep the adopted `minor` default provisional until a non-settling sandbox test confirms that `amount: 1000` displays exactly `1.000 TND`; do not enable live checkout based on this assumption;
- do not claim international-card or foreign-currency support;
- do not assume webhook authenticity or retry behaviour.

Next engineering steps after written confirmation: implement authoritative transaction lookup, authenticated/idempotent webhook reconciliation, exact order/amount/currency/product matching, safe settlement through the existing trusted RPC, and sandbox integration tests. Then run the repository typecheck, unit tests, migration-journal check, and production build on the branch. Review the full diff before any merge or deployment.
