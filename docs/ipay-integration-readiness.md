# iPay integration readiness — Algorea Bazaar

## Scope and invariants

- iPay is the selected buyer-collection provider for the planned checkout integration.
- Keep the existing Konnect integration intact; do not remove or silently reroute it.
- Do not enable live checkout as part of this preparation.
- Buyer payments are collected into the platform's iPay organisation/account. Do not use split payments or provider-managed seller payouts.
- Keep the existing TND order accounting, commission calculation, append-only platform ledger, seller balances, and weekly manual seller payouts unchanged.
- A buyer's digital download may be released only after authoritative provider-side confirmation of the exact amount, currency, transaction identity, and order association.
- Never commit API tokens/JWTs or other provider secrets. Store them only as server-side deployment secrets after the integration contract is confirmed.

## Confirmed from the supplied iPay documentation

- API base URL: `https://api.ipay.tn`
- Organisation authentication uses `X-Org-Id` and `Authorization: Bearer <JWT>`.
- JWTs are generated from the iPay organisation dashboard and are described as valid for one year.
- One-shot checkout endpoint: `POST /api/admin/transactions/create-oneshot`.
- Required request fields documented: `product_code`, `amount`, `currency`, `customer_name`, `customer_external_id`; optional `invoice_reference`.
- The documented response includes `id` and `payment_url`.
- The documented webhook events include `transaction.created`, `transaction.completed`, `transaction.expired`, and `transaction.failed`.
- The webhook documentation asks the receiver to respond with HTTP 200.
- The supplied documentation says iPay does not retry failed webhook deliveries.
- The supplied documentation mentions `GET /api/admin/transactions` for listing transactions, but does not provide a complete response schema or confirm a transaction-by-ID/status endpoint.

## Required answers from Audasoft before payment confirmation can be implemented

1. **Amount units:** Is `amount` expressed in TND millimes, TND decimal units, or another minor-unit convention? Provide a request/response example for a known amount such as 10.500 TND.
2. **Authoritative verification:** What exact endpoint and response fields let the merchant retrieve one transaction by ID or reliably filter the transaction list? The response must expose final paid/settled status, amount, currency, product code, and transaction ID.
3. **Webhook authenticity:** Is a signature, HMAC, secret header, mTLS, or another authenticity mechanism available? Document its exact header and verification algorithm. If none exists, confirm the supported secure reconciliation pattern.
4. **Manual transfer methods:** For bank transfer and postal transfer declarations, does `transaction.completed` mean funds have actually cleared and are available to the merchant, or only that the customer declared an intention/transfer? What status distinguishes pending from settled?
5. **International buyers:** Which enabled methods accept international Visa/Mastercard cards, which buyer currencies are supported, and in what currency does the platform receive settlement?
6. **Product and webhooks:** Confirm whether the existing product code `algorea-bazaar` is valid for one-shot transactions, and whether success/failure webhook URLs are configured per product or per transaction.

## Implementation gate

Until the above contract is confirmed, the integration must remain fail-closed:
- no live payment activation;
- no automatic order settlement from an unverified webhook;
- no download entitlement from a redirect or browser query parameter;
- no assumed amount-unit conversion;
- no assumption that a declared bank/postal transfer is settled.

Once Audasoft confirms the contract, implement the iPay adapter and webhook/reconciliation flow on this branch, test it in a non-live environment, and review the diff before any merge or deployment.
