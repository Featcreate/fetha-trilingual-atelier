# iPay settlement verification controls

Status: engineering foundation only; no provider contract has been confirmed and no live operation is enabled.

## Purpose

This module defines fail-closed rules for verifying future iPay payment settlement. It performs no HTTP calls, payment activation, download release, or financial-ledger posting.

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

## Financial and delivery boundary

- The buyer receives access to the purchased digital product only after the payment has been authoritatively verified as cleared and matched to the order.
- The download link is delivered to the email address associated with the buyer's account; the buyer should also be able to access purchased products from their account.
- This module does not implement email delivery, signed download URLs, download authorization, ledger posting, commissions, or seller payouts.
- Algorea Bazaar does not provide a routine refund workflow for digital purchases after payment confirmation and delivery. Any exceptional handling required by applicable law or the payment provider must be assessed separately; this is not implemented by this module.
- Existing platform collection, configurable commission, TND millime accounting, and manual seller payouts remain unchanged.

## Tests and verification

`src/lib/ipay-financial-controls.test.ts` covers evidence-source trust, cleared-funds gating, exact transaction/order/product/currency/amount matching, and safe integer millime validation.

## Still blocked

1. Audasoft written confirmation of authoritative transaction lookup and its final-cleared status.
2. Webhook authentication/signature and delivery/replay behavior.
3. Whether declared bank/postal transfers can be disabled or independently confirmed as received.
4. Sandbox tests against the actual iPay organisation without live settlement.

Do not enable `IPAY_CHECKOUT_ENABLED`, wire this module to checkout/webhooks, apply a production migration, or deploy live payment behavior until the provider contract is confirmed and the remaining gates are explicitly approved.
