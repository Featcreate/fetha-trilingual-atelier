# iPay integration readiness — Algorea Bazaar

Last reviewed against the repository and the in-dashboard iPay API documentation on 2026-11-10. This document distinguishes the documented API surface from provider capabilities that remain unverified.

## Scope and financial invariants

- iPay is a planned buyer-checkout provider. Keep the existing Konnect integration intact; do not silently reroute or mix provider transactions.
- Buyer payments, if approved, are collected into the platform's iPay organisation/account. Do not use split payments or provider-managed seller payouts.
- Keep TND order accounting, configurable platform commission, the append-only platform ledger, seller balances, and weekly manual seller payouts unchanged.
- A buyer redirect, browser query parameter, webhook event name, or customer-declared transfer is never sufficient proof of payment.
- Release digital downloads only after authoritative server-side verification of the exact transaction, order association, amount, currency, product, and final cleared/settled state.
- Never commit API tokens/JWTs or other provider secrets. Keep them only as server-side deployment secrets.

## Provider contract documented in the dashboard

### Authentication and API

- Base URL: `https://api.ipay.tn`.
- Required headers: `X-Org-Id: <organisation UUID>` and `Authorization: Bearer <JWT>`.
- The dashboard documentation says the organisation JWT is generated from Organisation settings and is valid for one year. Never expose it to the browser or source control.
- The dashboard admin uses a different admin code; external application integrations must use the organisation JWT.
- The dashboard says iPay-generated UUIDs for customers, plans, and subscriptions must not be sent in create/update request bodies.

### One-shot checkout

- Documented endpoint: `POST /api/admin/transactions/create-oneshot`.
- Documented request fields: `product_code`, `amount` (number greater than zero), `currency`, `customer_name`, `customer_external_id` (required), and optional `invoice_reference`.
- Documented response fields: `id`, `payment_url`, `amount`, `currency`, and `invoice_reference`.
- The example uses `amount: 149.99` with `currency: "TND"`, which is consistent with decimal dinars. However, the documentation does not explicitly state the unit rule or provide an exact 10.500 TND example. Treat decimal TND as the current code assumption, not a fully confirmed provider contract.
- The documented flow redirects the buyer to `payment_url`; the redirect itself is not proof of payment.

### Webhooks

The dashboard documentation says iPay sends POST requests to the product's configured webhook URL on each transaction status change. The documented event types are:

| Event | Documented meaning |
|---|---|
| `transaction.created` | New transaction created; payment pending |
| `transaction.completed` | Payment validated; the listed statuses include paid, bank transfer declared, and postal mandate declared |
| `transaction.expired` | Transaction expired without payment |
| `transaction.failed` | Payment failed |

The documented payload shape is:

```json
{
  "type": "transaction.completed",
  "timestamp": "2025-03-08T14:30:00Z",
  "data": {
    "id": "uuid-transaction",
    "status": "paid",
    "product_id": "uuid-produit",
    "customer_id": "uuid-client",
    "month": "2025-03",
    "amount": 49.99,
    "currency": "TND",
    "invoice_reference": "FAC-2025-001"
  }
}
```

- The dashboard instructs receivers to return HTTP 200.
- It explicitly says iPay does not retry when delivery fails.
- Configure success for `transaction.completed`; configure failure for `transaction.expired` and `transaction.failed`. `transaction.created` may be routed to either URL according to the provider documentation.
- **Critical semantic limitation:** `transaction.completed` includes customer-declared bank transfers and postal mandates. The event name and sample status `paid` therefore cannot be treated as proof that funds have actually arrived and cleared.
- The provided dashboard documentation does not specify a signature, HMAC, secret header, mTLS, replay-protection mechanism, or other way to authenticate webhook origin. Do not trust or process these events until Audasoft supplies and confirms the exact verification contract.
- The dashboard excerpt does not document a transaction-by-ID retrieval endpoint or the authoritative status that means funds are cleared/settled. The UI's transaction list and manual status editing are not substitutes for a verified API contract.

### Webhook health endpoint

- Documented endpoint: `GET /api/admin/webhooks/health`.
- Optional `probe=true` makes iPay issue a HEAD request to each configured callback URL and report reachability/status code.
- This endpoint checks callback configuration and network reachability only. It does not authenticate a webhook, verify a transaction, prove settlement, or replay a missed event.

## What the current code actually does

### Provider client — `src/lib/ipay.server.ts`

- Authenticates requests with `X-Org-Id` and `Authorization: Bearer <JWT>`.
- Builds the documented one-shot POST request with product code, TND currency, customer name, and order ID as external/invoice references.
- Converts canonical integer millimes to decimal dinars (`10500` millimes becomes `10.5` TND). This follows the documentation's decimal-looking example but remains subject to written provider confirmation.
- Applies a 15-second timeout and validates that the returned transaction reference is non-empty and the hosted URL is HTTPS on an iPay domain.
- Exposes a read-only webhook-health GET helper. It does not receive or process webhooks.
- Requires `IPAY_CHECKOUT_ENABLED=true` for one-shot creation.

### Checkout — `src/lib/shop.functions.ts` and `src/routes/checkout.tsx`

- The iPay checkout path is wired into the buyer checkout page, but it is available only when the activation gate and required credentials are present.
- It creates/reuses a pending cart order, claims initialization, requests one hosted checkout URL, and persists the iPay reference and URL.
- The redirect only sends the buyer to iPay. It does not settle an order or grant a download.
- Claim outcomes remain explicit: missing order, closed order, provider conflict, and an already-in-progress initialization are distinct errors.
- If the provider request times out or its response cannot be persisted, the claim deliberately remains locked. This avoids duplicate charges when iPay may have created a transaction but the response was lost. There is no automatic retry or automatic claim reset.

### Database migrations

- `0034_ipay_checkout_reference.sql` adds separate nullable iPay transaction-reference and checkout-URL fields with a unique partial index.
- `0041_ipay_checkout_init_claim.sql` serializes iPay initialization and prevents a competing Konnect initialization for the same order.
- These migrations do not implement iPay webhook receipt, authoritative transaction lookup, settlement, ledger posting, or seller payout.
- Do not apply new database migrations or alter production data as part of this readiness work.

## Known gaps and hard blockers

1. **Authoritative transaction lookup:** No verified iPay API contract is implemented to fetch a transaction by its provider ID and establish final cleared/settled status.
2. **Webhook authenticity:** No documented signature/HMAC/secret-header validation contract has been confirmed. There is no iPay webhook receiver in the application.
3. **Webhook event semantics:** `transaction.completed` can mean paid, bank transfer declared, or postal mandate declared. The event name alone cannot prove cleared funds.
4. **Webhook delivery:** The dashboard says there is no retry after delivery failure. The receiver will need idempotency and an independent reconciliation process; it cannot rely on retries.
5. **Stuck initialization recovery:** A claim left behind after an ambiguous timeout is intentionally not cleared automatically. It requires manual provider-dashboard reconciliation. Only after verifying that no transaction exists for the order may a separately authorised recovery procedure release the claim. If a transaction exists, record its exact reference and reconcile it through a verified provider lookup before any settlement.
6. **Marketplace eligibility and settlement:** Written confirmation is still needed that this organisation may collect marketplace orders for multiple digital-goods sellers and later pay sellers manually outside iPay.
7. **Amount contract:** The current code sends decimal TND. Audasoft must confirm the exact amount unit with a request/response example for 10.500 TND before checkout can be activated.
8. **International acceptance:** Do not claim support for foreign-issued cards or foreign-currency charging/settlement until Audasoft confirms supported schemes, issuing countries, and settlement currency.
9. **Fees:** The public marketing page advertises 1% capped at 5 TND per transaction. Confirm in writing that this applies to this organisation and all enabled methods, and ask about acquirer, refund, transfer, and payout-related fees.

## Safe handling of ambiguous or stuck iPay initialization

- Do not retry `startCartIpayCheckout` for an order whose initialization outcome is `payment_initialization_in_progress` or `payment_initialization_uncertain`.
- Do not clear `ipay_init_claimed_at` just because a timeout elapsed.
- An operator must inspect the iPay organisation dashboard and search using the exact order ID/external reference, customer, amount, and time window.
- If a matching transaction exists, capture its provider ID and current status. Do not settle until an authoritative API lookup contract confirms the exact amount, currency, product, order reference, and cleared state.
- If no matching transaction exists, retain evidence of the dashboard search and use a separately reviewed, admin-only recovery operation. No such automatic reset operation is implemented.
- If the dashboard result is ambiguous, leave the order pending and escalate to Audasoft. Do not create a second transaction.

## Provider questions still requiring written answers

1. **Amount:** Is `create-oneshot.amount` decimal TND or integer millimes? Provide a complete example for exactly 10.500 TND.
2. **Verification:** Which endpoint and fields confirm final paid/settled status, transaction ID, amount, currency, product code, and external order reference? Can the transaction list be filtered reliably by transaction ID or external reference?
3. **Webhook authenticity:** Is there HMAC/signature, a secret header, mTLS, or another authenticity mechanism? Provide exact validation instructions and replay protections.
4. **Bank/postal transfers:** Does `transaction.completed` mean funds have actually been received and cleared, or only that the customer declared a transfer? Which event/status proves receipt?
5. **Delivery/replay:** Confirm the no-retry policy, retry behaviour by account/API version, and whether missed events can be replayed or queried.
6. **Marketplace eligibility:** Is this account authorised to collect full orders for multiple digital sellers and pay sellers manually later? Which KYC/business documents are required?
7. **International acceptance:** Which card schemes and issuing countries are supported, and what are the charge and settlement currencies?
8. **Fees:** Confirm the 1% monthly-billed fee capped at 5 TND for this organisation, plus all external/acquirer, refund, and payout costs.

## Implementation gate

Until the provider contracts above are confirmed:

- Keep `IPAY_CHECKOUT_ENABLED` unset or set to `false`.
- Do not send real payment requests.
- Do not implement a webhook that changes order state without verified authenticity and transaction lookup.
- Do not settle orders or release downloads based on redirects, webhook names, or declared bank/postal transfers.
- Do not automatically clear or retry ambiguous initialization claims.
- Do not change the central ledger, commission calculation, seller balances, or manual weekly payout workflow.
- Do not configure webhook URLs in the iPay dashboard until a secure receiver is implemented, deployed over HTTPS, and explicitly approved.

## Next safe engineering phase after provider confirmation

Implement the documented transaction lookup, authenticated and idempotent webhook ingestion, exact order/amount/currency/product matching, and settlement through the existing trusted settlement RPC. Add reconciliation for missed events and a separately authorised admin recovery path for claims proven to have no provider transaction. Then run typecheck, formatting, lint, all unit tests, migration-journal checks, and production build. Review the full diff before merge or deployment.
