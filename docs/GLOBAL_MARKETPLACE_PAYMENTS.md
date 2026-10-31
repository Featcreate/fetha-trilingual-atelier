# Algorea Bazaar roadmap

## Product direction
- Global digital marketplace: sellers and buyers may join from supported countries; no physical goods or shipping.
- Seller registration, store creation and product listings remain free forever.
- Default platform commission: 5% (500 bps), configurable later.
- Buyer checkout providers are independent from seller payout providers.
- Seller payouts are weekly and manually reconciled by the platform; no automatic split settlement.
- Tunisia: iPay is the intended seller payout/onboarding option. Tunisian sellers must use Algorea Bazaar's verified iPay referral URL/code during iPay registration.
- Other countries: sellers must be offered only payout methods verified as available and legally usable in their country.
- Never promise global coverage until buyer payment methods and seller payout coverage are verified country by country.

## Completed
- [x] Homepage shell, Algorea Bazaar brand and French/Arabic/English language foundation.
- [x] Sub-Batch 1A marketplace schema and secure-download flow (database behaviour tests still need a disposable database).
- [x] Download reservation states, 45-second expiry and unit tests.
- [x] Independent GitHub working branch: `codex/algorea-bazaar-completion`.

## Required implementation
- [ ] Seller onboarding separate from customer signup: account type, country, seller profile and store setup.
- [ ] Country-aware payout eligibility; block seller activation until a verified payout route exists.
- [ ] Tunisian seller iPay referral flow, using the platform's verified referral URL/code from server configuration; record referral completion/status without exposing credentials.
- [ ] Non-Tunisian payout methods selected from a verified country/provider capability matrix; no iPay requirement outside Tunisia.
- [ ] Buyer payment-provider abstraction, independent of payout providers; choose providers only after confirming merchant eligibility for a Tunisia-registered platform and supported buyer countries/currencies.
- [ ] Remove direct Konnect checkout/webhook implementation only after replacement checkout flow and verified provider contracts are ready. Do not leave a live legacy Konnect route active.
- [ ] Verified server-to-server payment confirmation, amount/currency/order matching, idempotency and replay protection for every buyer payment provider.
- [ ] Seller payout ledger and weekly manual payout records with immutable audit trail; preserve the existing 5% commission calculation.
- [ ] Update French, Arabic and English UI strings and tests for all onboarding/payment states.
- [ ] Admin workflows for seller review, payout eligibility, weekly payout reconciliation and provider exceptions.
- [ ] Full automated tests and build/lint checks.

## External information required before provider implementation
- [ ] Obtain the actual Algorea Bazaar iPay referral URL/code and confirm the referral registration journey with iPay.
- [ ] Obtain iPay merchant documentation for seller account onboarding, payout/transfer capabilities, supported countries, fees, KYC and webhook/authentication rules.
- [ ] Verify buyer payment providers that onboard a Tunisia-registered marketplace and document country, currency, card/wallet, refund and dispute coverage.
- [ ] Confirm legal, tax, KYC/AML and consumer obligations for operating a cross-border digital marketplace.

## Safety gates
- No secrets, referral credentials or API tokens in Git.
- No production payment activation, deployment, merge to `main`, or changes to the live Supabase project without separate explicit approval.
- Database changes may be authored as migration files on this branch only; run them only against a disposable/preview database after approval.
- Never force-push, rewrite published history, or change the Lovable-connected branch.
