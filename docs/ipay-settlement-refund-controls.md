# iPay settlement and refund controls

Status: engineering foundation only; no provider contract has been confirmed and no live operation is enabled.

## Purpose

This module defines fail-closed rules for a future iPay adapter. It performs no HTTP calls, payment activation, download release, or financial-ledger posting. The SQL reservation functions are an isolated database guard for future refund orchestration; they do not call iPay or execute refunds.

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

## Refund acceptance and concurrency

- Refund values are positive integer TND millimes.
- Partial refunds are supported by the calculation rules; cumulative refunds may never exceed the original verified paid amount.
- The TypeScript idempotency key uses versioned, URI-encoded identifier components. Delimiter characters inside IDs cannot produce the same key for a different tuple; keys exceeding the database's 200-character limit are rejected.
- Migration `0035_ipay_refund_reservations.sql` adds a service-role-only reservation table and two guarded RPCs.
- `reserve_ipay_refund` locks the paid order row with `FOR UPDATE`, verifies that it is a verified TND order with an iPay transaction reference, totals all non-cancelled reservations, and atomically reserves only the remaining refundable amount. Concurrent requests for the same order therefore serialize before checking the remaining amount.
- A retry with the same idempotency key and identical order/request/amount returns the original reservation. Reusing a key or request ID with different data is rejected.
- Failed reservations remain counted until explicitly cancelled; this avoids freeing capacity while a provider outcome may still need reconciliation. A failed instruction can be retried using the same reservation.
- `transition_ipay_refund` serializes state changes on the same order row and enforces requested -> approved -> processing -> succeeded/failed, with cancellation from requested/approved/failed and retry from failed to processing. A succeeded state requires a provider refund reference or manual evidence reference.
- The SQL functions are not yet called by application code. They must be the only reservation path before any future provider refund request; an application-side read/check/insert sequence is not a substitute for this RPC.

## Financial/accounting boundary

The reservation migration does not reverse commission or seller payable entries, mutate the append-only platform ledger, change order status, revoke downloads, or call a provider. Any eventual refund must create compensating append-only ledger entries and adjust seller payable balances exactly once, in the same reviewed transactional workflow. No seller payout is initiated by iPay.

## Tests and verification

`src/lib/ipay-financial-controls.test.ts` covers source trust, cleared-funds gating, exact matching, millime arithmetic, state transitions, completion evidence, invalid values, idempotency-key delimiter collision resistance, and the key length limit.

The SQL reservation RPCs require a database regression test with two concurrent sessions against a disposable schema: for an order paid at 12,500 millimes, simultaneous 8,000 + 5,000 reservations must result in exactly one accepted reservation and one `ipay_refund_exceeds_remaining_paid_amount` rejection. Also test same-key retries, conflicting key reuse, failed reservation retention, cancellation release, and succeeded-state evidence enforcement.

## Still blocked

1. Audasoft written confirmation of authoritative transaction lookup and its final-cleared status.
2. Webhook authentication/signature and delivery/replay behavior.
3. Whether declared bank/postal transfers can be disabled or independently confirmed as received.
4. Refund API support, partial-refund semantics, fees, timing, and refund event schema.
5. Sandbox tests against the actual iPay organisation without live settlement.
6. Apply migration 0035 only after code review and a disposable-database regression test; it has not been applied to Supabase.

Do not enable `IPAY_CHECKOUT_ENABLED`, wire this module to checkout/webhooks, apply a production migration, or deploy live payment behavior until the provider contract is confirmed and the remaining gates are explicitly approved.
