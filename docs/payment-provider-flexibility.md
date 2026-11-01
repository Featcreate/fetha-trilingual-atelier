# Algorea Bazaar — configurable financial routing

## Initial operating configuration

- Preferred collection provider: **Konnect**.
- Seller settlement: **weekly manual transfer**.
- Platform-profit destination: **owner choice at withdrawal**.
- Platform commission: **5% by default**, snapshotted per order item.
- The platform maintains separate seller payable ledger entries and platform commission accounting.

## Changeability

The administrator can save future preferences for a bank payment gateway, iPay, or another provider; manual bank transfers or provider-mediated manual transfers; and the destination chosen for platform earnings. These are configuration preferences, not provider integrations.

Every preference change resets the configuration status to `pending_verification`. The setting does not switch checkout traffic, change credentials, enable live payment collection, initiate a transfer, or alter any historical order, ledger entry, payout batch, commission snapshot, or transfer record.

## Required gates before a route becomes operational

1. Confirm the provider's written terms permit a digital multi-seller marketplace to collect centrally and pay sellers manually.
2. Confirm supported buyer countries, card/payment methods, currencies, settlement schedule, fees, refunds, disputes, and chargeback handling.
3. Confirm the platform account is eligible for the intended business model and that manual transfers to third-party seller accounts are permitted.
4. Implement and test a dedicated provider adapter and server-side verification/webhook flow; never trust browser return parameters as proof of payment.
5. Test on a disposable database and provider sandbox. Reconcile every successful payment to exactly one order and one set of seller-ledger entries.
6. Obtain separate explicit approval before enabling live payments or real payouts.

## Security and accounting

- Never store provider passwords, OTPs, secret API keys, or bank login credentials in these settings.
- Only administrators can update routing preferences. Every change is written to an append-only audit table.
- Seller payout batches remain backed by verified paid sales, immutable commission snapshots, and unique ledger-entry allocation.
- A payout is marked paid only after the real transfer has completed and its external reference has been recorded.
- The admin payout action is an accounting record only; it does not move money.
- The existing Konnect implementation remains the only payment adapter in code until another provider is separately implemented and tested.
