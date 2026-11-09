# iPay settlement and refund controls

Status: engineering foundation only; no provider contract has been confirmed and no live operation is enabled.

## Purpose

This module defines the fail-closed rules that a future iPay adapter must satisfy before it can settle an order or mark a refund complete. It is intentionally pure: no HTTP calls, database writes, payment activation, download release, or ledger posting.

## Settlement acceptance

A candidate settlement is accepted only when all of the following match the original pending order:

- authoritative evidence source: a confirmed provider transaction lookup, or an actual bank statement/reconciliation record;
- exact iPay transaction reference;
- exact Algorea Bazaar order reference;
- exact iPay product code;
- currency TND with exponent 3;
- exact amount in integer millimes;
- funds explicitly classified as cleared.

A webhook, browser redirect, or customer-declared bank/postal transfer is never sufficient evidence by itself. The iPay public documentation currently does not establish the signature/authenticity mechanism, authoritative lookup schema, or which status proves cleared funds. The future adapter must not map a generic `transaction.completed` event to `fundsState: "cleared"` without written provider confirmation.

## Refund acceptance

- Refund values are positive integer TND millimes.
- Partial refunds are supported by the calculation rules; cumulative refunds may never exceed the original verified paid amount.
- Each refund request has its own stable idempotency key.
- State transitions are explicit: requested -> approved -> processing -> succeeded/failed; a failed refund may be retried as the same approved instruction; succeeded and cancelled are terminal.
- A refund cannot be marked succeeded without a provider refund reference or a manual bank evidence reference.
- No provider refund endpoint is called by this module. Audasoft must confirm whether full and partial refunds are supported, the exact API contract, fees, timing, and notifications.

## Financial/accounting boundary

This module does not yet reverse commission or seller payable entries, mutate the append-only ledger, change order status, revoke downloads, or create refund database records. Those actions require a reviewed transactional database function and a confirmed provider refund contract. Any eventual refund must create compensating ledger entries, never update or delete historical entries, and must adjust seller payable balances exactly once. No seller payout is initiated by iPay.

## Tests

`src/lib/ipay-financial-controls.test.ts` covers source trust, cleared-funds gating, exact transaction/order/product/currency/amount matching, partial-refund arithmetic, over-refund prevention, state transitions, completion evidence, and idempotency keys.

## Still blocked

1. Audasoft written confirmation of authoritative transaction lookup and its final-cleared status.
2. Webhook authentication/signature and delivery/replay behavior.
3. Whether declared bank/postal transfers can be disabled or independently confirmed as received.
4. Refund API support, partial-refund semantics, fees, timing, and refund event schema.
5. Sandbox tests against the actual iPay organisation without live settlement.

Do not enable `IPAY_CHECKOUT_ENABLED`, wire this module to checkout/webhooks, apply a new production migration, or deploy live payment behavior until the blockers are resolved and explicitly approved.
