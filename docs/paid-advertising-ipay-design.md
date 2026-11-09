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

- The public developer page documents `POST /api/admin/transactions/create-oneshot`, a transaction-list endpoint `GET /api/admin/transactions`, JWT bearer authentication, and the `X-Org-Id` header. It explicitly says full API field-level documentation is available inside the authenticated administration interface.
- The public one-shot page describes `transaction.completed` and `transaction.failed`, with payload fields including `id`, `status`, `product_id`, `customer_id`, `amount`, `currency`, and `invoice_reference`.
- Critically, the public webhook integration page says `transaction.completed` can be emitted when a customer declares a bank transfer or postal mandate, when an administrator manually changes a transaction to paid, or when a payment-gateway callback confirms payment. Therefore the event name alone is not proof that funds have cleared.
- The public pages reviewed do not specify a verifiable webhook signature/HMAC contract, a transaction-detail lookup schema, exact list filters/pagination guarantees, the final settlement state for each payment method, or an API refund contract.
- The current repository's `amount` unit remains provisional. Do not infer millimes/minor units from the currency code or public marketing pages.

Public references:
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

| Duration | Launch price |
| -------- | -----------: |
| 7 days   |       20.000 |
| 14 days  |       35.000 |
| 30 days  |       60.000 |

These are initial launch prices, not hard-coded permanent prices; administrators should be able to change future package prices without altering existing requests.
