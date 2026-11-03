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
- Current checkout baseline: the platform's canonical charge is TND. Konnect's public API accepts TND, EUR, and USD, and its documentation says non-TND payments are automatically converted; however, Algorea Bazaar currently sends TND only. An international buyer's card issuer may convert the TND charge into the cardholder's billing currency under the issuer's own exchange rate and fees.
- Do not describe this as charging every buyer in their local currency. Local-currency checkout (including EUR/USD) remains disabled until the exact charge, conversion, settlement currency, fee and FX fields returned by the provider are confirmed and implemented.
- When a foreign-currency charge is later enabled, record buyer currency, buyer amount in that currency's minor units, currency exponent, actual platform settlement currency/amount, FX rate, FX source, and quote timestamp.
- FX rate snapshots must be immutable. Historical orders are never recalculated using a newer rate.
- Informational USD/EUR equivalents shown in the catalogue are not checkout quotes and must never be used to settle orders.
- Commission is calculated against the canonical TND accounting amount. Use integer millimes for TND and deterministic rounding; never use binary floating-point for money.
- Buyer collection, platform settlement, provider fees, FX differences, platform commission, seller payable, refund, chargeback, and seller payout must remain separate ledger events. Provider-fee entries must be attributable to the affected seller/order item or allocated proportionally across sellers using a documented basis.

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

This implementation does not connect a provider, create credentials, activate checkout, make live charges, or transfer money. Migrations 0022–0024 have been applied to the original Supabase project. The provider adapter and checkout FX quote flow remain blocked until provider terms and sandbox behavior are verified.

Provider-side seller payout APIs are deliberately excluded. The administrator-controlled weekly manual payout functions are the only approved method; they prepare accounting records and confirm transfers only after an operator has sent the money.


## Current international card route — Konnect (not live)

Konnect publicly documents acceptance of international Visa and Mastercard cards and API support for TND, EUR and USD. Its published indicative fee for international cards is 2.9%, subject to the actual merchant agreement. The current Algorea Bazaar adapter uses the platform's Konnect receiver wallet and charges in TND, while the provider handles card processing and the buyer's issuer may convert the charge into the buyer's card currency.

This makes Konnect the leading candidate for the initial worldwide-buyer card route, not an approved production provider yet. Before activation, Konnect must confirm in writing that it accepts Algorea Bazaar's exact business model: one platform merchant account collecting payment for digital products supplied by multiple independent Tunisian sellers, with no provider-side split and all seller balances/payouts managed exclusively by Algorea Bazaar. Confirm digital-goods eligibility, country/card restrictions, settlement to the platform's account, fees, reserves, refund/chargeback liability, and settlement timing.

The current checkout code is fail-closed and remains disabled until separate sandbox and live activation controls are configured and approved. No API credentials, live charges, or transfers are activated by the repository changes.


## Database deployment status — 2026-11-03

Migration 0022 has been applied to the original Supabase project jgjcychkntsokhzeziqs and is recorded in its migration history. A transaction-wrapped dry run against the actual project schema succeeded before application. Post-application checks confirmed the ledger table, RLS, indexes, immutability triggers, currency constraints, and weekly/manual-only payout constraints. The ledger, orders, order items, payout batches and payout preferences remain empty. This database change does not activate checkout or move money.


## Seller-borne external fees — implemented, manual evidence entry

- Migration 0023 adds `seller_external_fee_entries` and `seller_payout_fee_allocations`, both append-only and seller/admin readable under RLS.
- An administrator records an actual fee only with a positive TND amount, category, source, external statement/receipt reference, description, and idempotency key. The RPC validates administrator authorization and seller/store ownership, then records a matching debit in the central platform ledger.
- Migration 0023 extends payout snapshots with `external_fees_millimes` and updates payout creation so outstanding fees are allocated exactly once and subtracted from the seller's final payable after commission. The existing sale ledger and payout-item records continue to preserve the pre-fee seller sale proceeds.
- A payout is blocked if recorded external fees exceed the available seller proceeds; those fees remain outstanding until later proceeds are available. Failed payouts retain their allocation and may be retried as the same payout.
- Sellers can view fee entries, allocated amounts, remaining amounts, and fee deductions on each payout. Administrators can record fees and prepare/confirm manual weekly transfers.
- Fee amounts are currently entered manually from evidence and recorded in TND. Automatic provider API fee ingestion and non-TND fee conversion are not implemented. Do not record estimates or guessed amounts.
- Migrations 0023 and 0024 were applied successfully to the original Supabase project after transaction-wrapped dry runs. No fee rows, allocations, orders, payouts or ledger rows were created by deployment.
