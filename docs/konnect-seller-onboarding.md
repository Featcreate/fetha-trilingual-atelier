# Konnect seller registration — all countries

## One registration route for every seller

Algorea Bazaar does not restrict seller onboarding by nationality, country, or place of residence. Every seller sees the same platform referral link and may choose to register with Konnect:

- Referral code: `31XyM7MR8wy71ga7a`
- Registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a

Do not route sellers to different providers based on their country. Do not impose a platform-side country, nationality, residence, Tunisian phone-number, or Tunisian-bank-account eligibility check.

## Provider-controlled eligibility

Konnect alone decides whether it can open and verify an account for a particular seller and which identity, phone, banking, residency, and other documents or details it requires. Algorea Bazaar does not guarantee that Konnect will accept every applicant and does not override Konnect's checks.

A seller who cannot open or verify a Konnect account is not blocked from creating an Algorea Bazaar account, opening a free store, or preparing product listings solely for that reason. Payouts to that seller cannot be promised or processed through Konnect unless the provider has accepted the seller and a lawful, verified payout route exists.

The registration link is an account-registration/referral link only. It does not link the seller's Konnect wallet to Algorea Bazaar automatically, prove account ownership, enable checkout, or enable automatic split payments or payouts. Do not collect or store Konnect passwords, OTPs, or private credentials.

## Payout operating policy

- Platform commission: 5% by default, configurable by an authorized administrator.
- Seller proceeds: the sale amount less the platform commission; provider/bank/transfer/withdrawal fees remain separate and are charged to the responsible party as disclosed.
- Weekly manual transfer remains the current payout workflow. The admin dashboard records a transfer only after it has actually been completed; it does not send money.
- Direct Konnect wallet payouts and automatic split payments remain disabled until Konnect confirms the required API capability, seller-account linking, eligibility, settlement currency, limits, fees, and transfer references, and sandbox tests pass.
- Do not use iPay as an automatic fallback for sellers outside Tunisia. Any additional provider must be separately evaluated and explicitly configured; no seller-country routing is currently implemented.
- Do not block store creation or product listing because a seller has not registered with Konnect.

## Launch checks

Before enabling live checkout or any payout method, verify the referral attribution, seller-account identification/linking, legal and contractual payout flow, transfer currency and fees, reconciliation, and failure handling. Keep live payments and payouts disabled until the required review and explicit approval are complete.
