# Global marketplace, seller onboarding and payment architecture

## Product rules
- Algorea Bazaar is a global marketplace for digital products only.
- Buyer payment collection and seller payout are separate capabilities and must use independent provider adapters.
- Seller registration, store creation and product listing stay free forever.
- The initial platform commission is 5% (500 basis points), calculated server-side.
- Seller payouts are reconciled weekly and transferred manually by the platform; no automatic split settlement.
- A seller may be activated only when their country has a verified, legally usable payout route.

## Seller onboarding
1. A user creates a customer account or chooses seller onboarding.
2. Seller onboarding collects country, legal/display name, contact details and required business/KYC details only when the selected payout provider requires them.
3. The server determines payout options from a maintained country/provider capability matrix. Never trust a country or eligibility flag supplied only by the browser.
4. For Tunisia, show iPay as the intended payout/onboarding route. Continue through Algorea Bazaar's official iPay referral URL/code, supplied from server-side configuration after the referral flow is verified with iPay.
5. Record referral handoff/completion status and provider reference without storing passwords, API tokens or sensitive payment credentials in application metadata.
6. Do not mark the seller payout-ready until iPay (or the applicable provider) confirms onboarding and eligibility.
7. For sellers outside Tunisia, do not require iPay. Show only payout methods whose country support and platform eligibility have been verified.
8. Keep the store/listing features free; payout eligibility is a compliance/settlement gate, not a subscription or seller fee.

## Tunisian iPay referral requirement
- Configuration must use the actual platform-owned referral URL/code; do not invent or hardcode a placeholder code as if it were valid.
- Keep referral configuration server-side (for example, a deployment secret/config value) and never commit it to Git.
- Confirm with iPay whether attribution requires a referral URL, a code entered in iPay's form, a platform-created customer flow, or another mechanism.
- Confirm that the referral program applies to merchant/seller accounts and that it supports the intended payout flow.
- If iPay referral configuration is missing or provider verification fails, stop the iPay handoff with a clear translated message; do not silently send the seller to an untracked generic signup page.

## Buyer checkout
- Buyers may be located internationally. The checkout UI should display only payment methods supported for the buyer's country, currency and transaction.
- The platform must first verify that each buyer payment provider will onboard a marketplace operated by a Tunisia-registered business.
- Use a provider adapter interface so additional providers can be added without coupling checkout to seller payouts.
- A redirect/success page is never proof of payment. Verify payment server-to-server or via an authenticated, replay-safe webhook.
- Before settlement, match provider transaction, internal order reference, amount and currency. Enforce idempotency and store provider event identifiers.
- Do not activate live payments until provider contracts, credentials, webhook authentication, refunds, disputes and settlement behaviour are tested.

## Seller payout accounting
- Maintain immutable sale/commission/seller-payable records.
- Commission defaults to 5%; seller payable is the order-item payable amount minus the platform commission.
- Record weekly manual payout batches with seller, country, currency, provider, payout reference, amount, status, operator and timestamps.
- A payout batch must be idempotent and auditable. Never edit or delete historical ledger rows; append reversal/correction records if required.
- Do not claim that iPay or another provider can pay sellers internationally until supported countries, currencies, fees, KYC and transfer rails are confirmed.

## Required verification before implementation can be completed
- Actual Algorea Bazaar iPay referral URL/code and written confirmation of attribution behaviour.
- iPay documentation or account-specific instructions for merchant onboarding, payouts/transfers, country coverage, fees, KYC and webhook authentication.
- A provider capability matrix for buyer payments, including merchant eligibility for a Tunisia-registered platform, buyer countries, currencies, payment methods, refunds and disputes.
- Review of cross-border tax, KYC/AML, consumer-protection and digital-content requirements.

## Safety boundaries
- Never place referral codes, API tokens, webhook secrets or credentials in source control.
- Database migrations may be authored on the isolated working branch, but must not be applied to live Supabase without separate approval.
- No production payment activation, deployment, merge to main, or change to the Lovable-connected branch without separate explicit approval.
