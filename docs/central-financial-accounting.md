# Algorea Bazaar — central financial accounting

## Product decision

Algorea Bazaar is a worldwide digital marketplace for buyers. During Phase 1, seller onboarding and seller payouts are limited to Tunisia. These are separate dimensions: worldwide buyers do not mean worldwide seller payout coverage.

The platform owns the complete financial accounting and seller-payout workflow. Payment providers are external collection/settlement rails only.

## Money flow

1. A buyer anywhere in the provider's supported coverage selects a product and a supported payment method.
2. The provider collects the buyer's payment for Algorea Bazaar and settles the proceeds to the platform's own merchant/settlement account.
3. Algorea Bazaar verifies the payment server-to-server and records the collection and actual provider settlement.
4. The platform's internal financial system records the order and immutable currency/FX details where applicable.
5. The system calculates the platform commission (5% default, configurable for future orders) and each seller's payable amount.
6. The platform alone holds the seller-payable accounting balance and initiates the seller transfer. The default cadence is weekly and manual.
7. After the transfer has actually succeeded, the platform records the transfer reference and closes the payout batch.

No payment provider, bank integration, wallet, or intermediary is allowed to split the buyer's payment or distribute seller proceeds directly.

## Accounting currency and FX

- The canonical product price, commission calculation, seller payable, and Phase 1 seller payout currency are TND.
- A foreign buyer charge is represented separately from the canonical TND order value.
- Record buyer currency, buyer amount in that currency's minor units, currency exponent, actual platform settlement currency/amount, FX rate, FX source, and quote timestamp.
- FX rate snapshots are immutable. Historical orders are never recalculated using a newer rate.
- Informational USD/EUR equivalents shown in the catalogue are not checkout quotes and must never be used to settle orders.
- Provider conversion/settlement behavior must be confirmed before selecting the checkout amount and recording the final FX result.
- Commission is calculated against the canonical TND accounting amount. Use integer millimes for TND and deterministic rounding; never use binary floating-point for money.
- Buyer collection, platform settlement, provider fees, FX differences, platform commission, seller payable, refund, chargeback, and seller payout must remain separate ledger events.

## Internal ledger semantics

The platform ledger is an append-only accounting record. It is not a bank account, stored-value wallet, escrow license, or payment instrument. Actual funds remain in the platform's external merchant/bank account; the ledger records how those funds and obligations are attributed.

The ledger migration:
- records transaction currency/amount separately from canonical TND accounting amount;
- posts verified TND buyer collections, platform commission, and seller payables inside the same trusted order-settlement transaction;
- posts a seller-payout debit only when an administrator records a completed weekly/manual transfer;
- backfills verified paid TND orders and completed TND manual payouts using idempotent keys;
- supports order, order-item, seller, store, and payout-batch attribution;
- validates seller/store ownership, order-item amounts, and payout amount/reference consistency;
- permits read access to administrators only;
- permits writes only through the trusted service role;
- rejects updates and deletes to preserve the audit trail;
- forces every seller payout preference and payout batch to the weekly/manual platform route, and permanently keeps the legacy Konnect-direct-payout switch false.

**Current implementation boundary:** the existing verified settlement path is TND-only. The migration adds buyer-currency and FX snapshot columns, but it does not yet enable foreign-currency checkout or populate provider-settlement, provider-fee, or FX-conversion entries. Those require the selected provider's confirmed charge/settlement contract and a provider-specific adapter. Checkout remains disabled.

## Provider acceptance checklist

A provider is suitable only if it confirms in writing:
- worldwide buyer acceptance for the countries we intend to serve;
- support for digital goods and a multi-vendor marketplace where the platform is the sole merchant/collection beneficiary;
- settlement to the platform's own account;
- supported buyer charge currencies and the actual settlement currency;
- exact fees, settlement timing, refunds, disputes, chargebacks, and reserve/hold rules;
- reliable server-side payment verification, webhook signatures or equivalent verification, idempotency, and reconciliation.

A provider's general Visa/Mastercard logo or claim of international payments is not enough.

## Non-goals and activation gates

This implementation does not connect a provider, create credentials, activate checkout, make live charges, apply the migration to Supabase, or transfer money. The provider adapter and checkout FX quote flow remain blocked until provider terms and sandbox behavior are verified and the user separately approves live activation.

Seller payout APIs are deliberately excluded. The existing weekly manual payout workflow remains the only approved method.
