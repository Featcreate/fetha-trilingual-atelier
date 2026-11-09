# Multi-provider buyer payment architecture

**Status:** Architecture foundation only. Buyer checkout remains fail-closed; no provider is enabled by this document.

## Product decision

Algorea Bazaar supports a provider-neutral buyer checkout design. Konnect, iPay and additional providers may be offered when their specific merchant account, buyer country, currency and payment method are confirmed as supported. The marketplace must not assume that every provider supports every country or payment method.

## Shared marketplace flow

1. The server creates or reuses the order using canonical server-side prices.
2. The buyer selects one of the currently eligible payment providers.
3. The selected provider adapter creates a hosted checkout and returns its provider reference.
4. The order records the provider ID and provider-specific reference. The client cannot choose an arbitrary provider or supply a trusted amount.
5. The provider adapter verifies the transaction using an authoritative provider-side lookup or other approved settlement evidence. Browser return parameters and unverified webhooks are never proof of payment.
6. A single idempotent marketplace settlement path validates order, provider reference, exact amount and currency, then verifies the returned provider ID, order ID, provider reference, exact amount and currency before posting the central ledger entries and seller payable.
7. The same verified-payment entitlement and in-account delivery flow is used regardless of provider.

## Provider adapter boundary

Each adapter is responsible only for provider-specific operations:
- credential/configuration validation;
- hosted checkout creation;
- provider reference handling;
- authoritative payment status and amount verification;
- provider-specific error normalization.

The marketplace remains responsible for:
- order creation and immutable pricing snapshots;
- the central financial ledger and configurable commission;
- seller payable balances and weekly manual payouts;
- buyer entitlements, product delivery and download controls.

A provider adapter must never initiate seller payouts or split buyer funds between sellers.

## Eligibility and fail-closed behavior

The shared eligibility helper requires:
- explicit provider enablement;
- a valid two-letter buyer country;
- an explicitly supported buyer country;
- the canonical TND checkout currency;
- a positive integer amount in millimes;
- at least one confirmed and enabled payment method.

An empty or unknown capability list is not interpreted as global support. The server must repeat eligibility checks after receiving the buyer's provider selection. UI visibility alone is not an authorization control.

## Current implementation boundary

The initial code foundation adds:
- a shared provider adapter contract;
- a fail-closed provider eligibility resolver;
- unit tests for country, currency, amount, method and disabled-provider cases; and a settlement guard that rejects a verification result from a different provider.

This foundation is not yet wired into the checkout UI or order creation. Existing Konnect checkout and iPay one-shot code remain provider-specific. The next implementation step is to add provider selection and persist the selected provider/reference on the order, then route status verification through the selected adapter without duplicating settlement. This requires a schema migration coordinated with PR #68's pending migration sequence and must not be applied to production until explicitly approved.

## Currency and settlement

TND remains the canonical order, ledger, commission and seller-payable currency. iPay amount-unit behavior remains provisional until verified in its sandbox. A future provider or foreign-currency checkout must not be enabled until the provider's charge amount, settlement amount, currency conversion, fees and reconciliation evidence are implemented and tested.

## Release gates

- Written provider approval for Algorea Bazaar's platform-owned collection model and digital multi-seller products.
- Confirmed country, card/method, currency, fee, settlement and dispute coverage.
- Separate sandbox credentials and tests for each provider.
- Authoritative server-side verification and idempotent settlement tests.
- Duplicate, delayed, partial, failed, expired and mismatched payment tests.
- No live activation, database migration, Supabase change or Render deployment without explicit approval.
