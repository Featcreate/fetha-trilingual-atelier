# Paid advertising — iPay collection design

## Approved product rules

- Paid placements are a separate platform revenue stream; they are not product sales, seller commission, or seller payable.
- At most three advertisements may be active at once.
- Launch prices (administrator-configurable): 7 days = 20 TND, 14 days = 35 TND, 30 days = 60 TND.
- Each request stores an immutable price and duration snapshot.
- Advertiser submits image, title, description, and destination URL.
- An advertisement is not displayed until payment is authoritatively confirmed and an administrator approves its content.
- The paid period starts when the advertisement becomes active, not when the request is created.
- Renewal requires a new request and payment.
- Arabic, French, and English UI.
- Advertising receipts/refunds/cancellations are recorded separately in the platform financial ledger.

## Collection provider

Use the platform's existing iPay organisation account and the existing server-only one-shot client in `src/lib/ipay.server.ts`. Do not use Konnect for advertising checkout. Do not create another provider account or expose provider credentials to the browser.

## Required transaction lifecycle

1. Authenticated advertiser creates a request using a server-selected package price.
2. Server creates a unique advertising request reference and iPay one-shot transaction for the exact TND amount.
3. Advertiser is redirected to the hosted iPay payment URL.
4. The server verifies the transaction using an authoritative iPay transaction lookup and validates transaction ID, external reference, product code, exact amount, currency, and final cleared/paid state.
5. Only after verified payment does the request become paid-awaiting-review.
6. Admin approves or rejects the creative. Approval activates it only if a placement slot is available.
7. Enforce the three-active-ad limit atomically in the database; never rely on a client-side count.
8. On activation, set the start/end timestamps and record an idempotent advertising-revenue entry in the central ledger. Refunds and cancellations use separate, linked ledger entries.

## Public iPay documentation audit (2026-11-09)

Reviewed the public iPay by Audasoft developer, one-shot payment, webhook/integration, and administration pages:

- The authenticated API documentation supplied for the Algorea Bazaar iPay organisation confirms `POST /api/admin/transactions/create-oneshot`, JWT bearer authentication, and the `X-Org-Id` header. The supplied documentation excerpt does not specify a transaction-list or transaction-detail endpoint.
- The public one-shot page describes `transaction.completed` and `transaction.failed`, with payload fields including `id`, `status`, `product_id`, `customer_id`, `amount`, `currency`, and `invoice_reference`.
- Critically, the public webhook integration page says `transaction.completed` can be emitted when a customer declares a bank transfer or postal mandate, when an administrator manually changes a transaction to paid, or when a payment-gateway callback confirms payment. Therefore the event name alone is not proof that funds have cleared.
- The supplied authenticated documentation shows the webhook payload and health endpoint, but does not specify a verifiable webhook signature/HMAC contract, an authoritative transaction-detail lookup schema, the final settlement state for each payment method, or an API refund contract.
- The authenticated one-shot example sends `amount` as a decimal number (for example, `149.99`) with `currency: "TND"`. The supplied schema still does not define TND decimal precision or explicitly state whether the value is dinars or millimes. The current code defaults to minor units (millimes), so this is a concrete unresolved mismatch; do not enable checkout or assume either unit until iPay confirms it and a sandbox test validates it.

References:
- https://www.ipay.tn/developpeurs
- https://www.ipay.tn/produits/paiement-oneshot
- https://www.ipay.tn/produits/webhooks-integrations
- https://www.ipay.tn/produits/interface-administration

## Provider confirmations required before implementation

Obtain written answers from Audasoft/iPay support for the existing Algorea Bazaar organisation and product:

1. Is this account/product authorised to collect paid advertising/marketplace promotion fees, in addition to digital-product purchases?
2. What exact endpoint and response schema retrieves one transaction by its iPay transaction ID? Which immutable fields identify the transaction, and what are the supported status values?
3. Which status proves funds are actually received/settled for each payment method? Specifically distinguish card/Flouci gateway confirmation from customer-declared bank transfer or postal mandate and manual dashboard status changes.
4. Does iPay sign outbound webhooks? Specify the signature header, algorithm, canonical signed bytes, secret/key provisioning, timestamp tolerance, and replay protections. If no signature exists, what authenticated server-side verification procedure is supported?
5. What exact amount unit and decimal precision does create-oneshot expect and return for TND? Confirm with a non-settling sandbox test.
6. What is the supported refund endpoint, request schema, idempotency behavior, and final refund status? Can refunds be issued for each payment method?
7. Can the existing product's success/failure webhook URLs be configured independently for the advertising callback, or is there a product-level shared callback constraint?

Until these answers are received and validated, do not implement a guessed lookup/webhook/refund contract.

## Safety gate — do not activate live advertising checkout yet

The repository's current iPay integration is only a server-side one-shot request builder. No webhook handler, authoritative transaction reconciliation path, or webhook-authenticity verification has been implemented. The public documentation confirms that `transaction.completed` may represent a declared transfer or manual status change, not necessarily cleared funds.

Therefore:

- Keep `IPAY_CHECKOUT_ENABLED` disabled.
- Do not mark an advertising request paid from a browser redirect or unverified webhook.
- Do not activate or display an ad based only on a submitted receipt or event name.
- Do not apply any database migration to the live Supabase project as part of this preparation.
- Do not add or change production iPay credentials.
- Implement reconciliation and refund handling only against the provider's confirmed contract, then test in sandbox before any production activation.

## Existing accounting integration

The central ledger table is `public.platform_financial_ledger_entries`. Its current `entry_type` check constraint does not yet include an advertising-revenue type. A future additive migration must add a dedicated type (for example `advertising_revenue`) and preserve the ledger's idempotency, append-only, admin-only read boundary, and TND millime accounting. Advertising entries must not carry order, seller, store, or seller-payout references.

## Package pricing (TND)

- 7 days: 20.000 TND
- 14 days: 35.000 TND
- 30 days: 60.000 TND

These are initial launch prices, not hard-coded permanent prices; administrators should be able to change future package prices without altering existing requests.


## Authenticated iPay API details supplied for Algorea Bazaar (2026-11-09)

The user supplied the documentation visible inside the authenticated iPay dashboard for the Algorea Bazaar organisation. This is more specific than the public documentation reviewed above.

### Authentication and secret handling

- Base URL: `https://api.ipay.tn`.
- External integrations require `X-Org-Id` and `Authorization: Bearer <jwt>`.
- The JWT is generated from the organisation administration area and is valid for one year according to the supplied documentation.
- The organisation identifier is an account identifier, not a credential. Never commit the JWT, place it in browser code, or expose it in logs.
- Use server-side environment configuration only. The supplied organisation identifier is intentionally not copied into repository documentation.

### One-shot transaction

The confirmed create endpoint is:

`POST /api/admin/transactions/create-oneshot`

Required JSON fields:

- `product_code`: iPay product code.
- `amount`: positive number.
- `currency`: `TND`.
- `customer_name`: buyer name.
- `customer_external_id`: unique order/reference identifier.
- `invoice_reference`: optional display reference.

The documented response contains `id`, `payment_url`, `amount`, `currency`, and `invoice_reference`. Redirect only to the validated HTTPS payment URL returned by iPay.

The documentation example uses a decimal amount such as `149.99`. It does not define the exact TND precision or explicitly settle whether this is a major-unit or millime value. The existing implementation's default `IPAY_AMOUNT_UNIT=minor` therefore remains unsafe until confirmed. Keep checkout disabled.

### Webhook events and payload

The supplied documentation lists:

- `transaction.created`: transaction created and pending.
- `transaction.completed`: documented as paid/confirmed, but may also represent a declared bank transfer or postal mandate.
- `transaction.expired`: expired without payment.
- `transaction.failed`: failed payment.

The documented payload includes `type`, `timestamp`, and `data` fields: `id`, `status`, `product_id`, `customer_id`, `month`, `amount`, `currency`, and `invoice_reference`.

The documentation says to return HTTP 200 to acknowledge receipt and warns that iPay will not retry after an error. Therefore, a production handler must durably enqueue/store the event before returning 200, and separately reconcile it with an authoritative provider-side status. Do not treat the event name or a customer-declared transfer as cleared funds.

The supplied material does not describe a webhook signature, HMAC, authentication header, signed payload, or replay-protection mechanism. Obtain the exact verification contract from Audasoft before accepting events as trusted.

### Webhook health

The supplied documentation confirms:

`GET /api/admin/webhooks/health`

Optional `probe=true` performs HEAD checks against configured success/failure webhook URLs. This checks reachability only; it does not authenticate webhook events or prove transaction settlement.

### Invoices

The supplied documentation confirms these server-side endpoints:

- `GET /api/admin/invoices` — list invoices, optionally filtered by `customer_id`.
- `GET /api/admin/invoices/:id` — invoice details.
- `GET /api/admin/invoices/:id/pdf` — PDF download.

The invoice record includes transaction/customer IDs, amount, currency, customer name, product code/name, invoice reference, and timestamps. Invoice availability is useful for reconciliation/audit, but an invoice alone must not be treated as proof that funds have cleared unless iPay confirms that semantic.

### Still not documented in the supplied material

The authenticated documentation provided here does not include:

- A transaction-by-ID lookup endpoint or complete transaction-list schema.
- A trusted settlement state that distinguishes completed card/Flouci payments from declared bank/postal transfers and manual dashboard status changes.
- Webhook signing/authentication and replay protection.
- Refund endpoint, request schema, and idempotency behavior.
- Explicit TND amount precision/unit.

These remain blocking questions for the provider. Do not invent endpoints or implement an unverified payment state machine.
