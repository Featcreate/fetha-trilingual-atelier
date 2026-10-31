# Algorea Bazaar roadmap

## Product direction
- Global digital marketplace for digital products only; no physical goods or shipping.
- Sellers and buyers may join from supported countries, subject to verified payment and payout coverage.
- Seller registration, store creation and product listings remain free forever.
- Default platform commission: 5% (500 bps), configurable later.
- Buyer checkout providers are independent from seller payout providers.
- Seller payouts are reconciled and transferred weekly by the platform; no automatic split settlement.
- Tunisian sellers use Algorea Bazaar's verified iPay referral URL/code for iPay onboarding and payout, once confirmed with iPay.
- Sellers outside Tunisia are not required to use iPay; offer only payout methods verified for their country.

## Completed
- [x] Homepage shell, Algorea Bazaar brand and French/Arabic/English language foundation.
- [x] Sub-Batch 1A marketplace schema and secure-download flow (database behaviour tests still need a disposable database).
- [x] Download reservation states, 45-second expiry and unit tests.
- [x] Independent working branch: `codex/algorea-bazaar-completion`.

## Implementation backlog
- [ ] Separate customer and seller onboarding; capture seller country and seller/store profile.
- [ ] Country-aware payout eligibility; do not activate seller sales until a verified payout route exists.
- [ ] Tunisian iPay referral onboarding using the platform's verified referral URL/code from server configuration.
- [ ] Non-Tunisian payout methods based on a verified country/provider capability matrix.
- [ ] Buyer payment-provider abstraction independent of seller payout providers.
- [ ] Select buyer payment providers only after confirming merchant onboarding eligibility for a Tunisia-registered platform and country/currency coverage.
- [ ] Replace direct Konnect checkout and webhook with verified buyer payment provider adapters; do not leave an active legacy Konnect route.
- [ ] Server-to-server payment confirmation, amount/currency/order matching, idempotency and replay protection.
- [ ] Immutable seller payout ledger and weekly manual payout reconciliation, preserving the 5% commission calculation.
- [ ] Admin seller/payout review and reconciliation workflows.
- [ ] French, Arabic and English translations plus tests for all new states.
- [ ] Full tests, lint and production build; DB behaviour tests against a disposable database.

## External prerequisites
- [ ] Actual Algorea Bazaar iPay referral URL/code.
- [ ] iPay confirmation of referral attribution, seller onboarding, payouts/transfers, supported countries, fees, KYC and webhook/authentication requirements.
- [ ] Verified buyer payment providers that onboard a Tunisia-registered marketplace, with documented countries, currencies, payment methods, refunds and disputes.
- [ ] Review cross-border tax, KYC/AML, consumer and digital-content obligations.

## Safety gates
- No secrets, referral credentials or API tokens in Git.
- No live payments, deployment, merge to `main`, or changes to live Supabase without separate explicit approval.
- Database migrations may be authored on this branch only; run them only against a disposable/preview database after approval.
- Never force-push, rewrite published history, or change the Lovable-connected branch.
