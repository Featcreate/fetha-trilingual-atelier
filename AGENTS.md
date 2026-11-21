<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- UI text lives in the static dictionary in src/lib/i18n.ts (fr default, ar RTL, en); add every new string for all three languages so switching never shows missing text.
- Payments settle only through the service-role `settle_order_payment` RPC (verified or simulation mode; simulation never writes seller ledger) — one idempotent, transactional path.
- Downloads go reserve_download → sign (300s) → finalize_download; release on signing failure — quota counts only finalized downloads and 5-minute repeats are free.
- Product files live in immutable `product_file_versions` with server-built paths; `product_files` is deprecated and kept only for compatibility.
- Seller file retention is manual: never automatically delete files or old versions. Show a direct delete action for every seller file version; before physical deletion, archive active or pending versions through the server RPC and reject deletion of the last active file while its product is active.
- Block physical deletion whenever an immutable `order_item_files` purchase snapshot references the version. Keep version metadata, buyer entitlements, and purchase snapshots; append a `storage_cleanup_audit` record after successful deletion.
- Checkout snapshot insertion must recheck active version status and Storage-object existence while holding the product row lock, serializing it against seller archival/deletion. A successfully deleted version no longer consumes the seller's application quota.
- Financial, purchase-snapshot, entitlement and audit rows use ON DELETE RESTRICT plus immutability triggers — never cascade-delete them.

## Seller country and provider eligibility

- Worldwide buyers are supported as the product target, subject to the selected buyer-payment provider's confirmed coverage and applicable law.
- Phase 1 seller onboarding is limited to sellers in Tunisia. Do not advertise or promise worldwide seller onboarding or payout coverage.
- Seller-facing Konnect, iPay, and WePay buttons are optional external information/account links only. They are not buyer-payment integrations, account-linking mechanisms, or payout execution features.
- Seller store creation and product listing must not depend on registering with any of these providers.
- Never collect provider passwords, OTPs, API secrets, or private credentials.

## Current authoritative financial model

- Buyer payments are collected centrally by the platform during the initial launch. The platform accepts the three approved receiving categories only: the owner's personal Flouci account, personal bank account, or personal postal account. Do not introduce additional collection categories without a new explicit product decision.
- The checkout must show the exact receiving details and a unique order reference. The platform administrator manually verifies that the full amount has arrived before marking the order paid and unlocking downloads. A transfer screenshot or buyer claim is not proof of payment.
- Store an immutable snapshot of the selected receiving method, beneficiary name, account identifier, and payment instructions on each order. Display "Algorea Bazaar" as the buyer-visible beneficiary on checkout and order snapshots. Keep the actual account-holder name in a separate private field readable only by the platform administrator.
- Do not use split payments. The platform calculates seller balances and the 10% commission for each successful sale. Seller payout review and weekly settlement are handled manually by the platform administrator.
- Preserve the financial ledger, order snapshots, audit history, and idempotency. Do not rewrite historical order economics when commission settings change.
- Never collect provider passwords, OTPs, API secrets, or private credentials from buyers or sellers.

## Security operations

- The product-files Storage bucket must remain private. Every uploaded or replaced seller file remains pending and unlisted until its complete bytes pass the self-hosted ClamAV workflow on an ephemeral GitHub-hosted Linux runner. Only the service-role-only scan completion RPC may mark a version clean and activate it.
- GitHub Actions authenticates to the scanner Edge Function with a short-lived GitHub OIDC token restricted to this repository, the main branch, and the dedicated workflow. The Edge Function creates a short-lived signed URL for one claimed file; never place seller files in Git, workflow artifacts, caches, or logs. Remove temporary runner copies after scanning.
- Fail closed: infected, unavailable, timed out, malformed, size-mismatched, or digest-mismatched scans must never activate a file. Public product reads and checkout purchase snapshots require an active version with scan_status=clean. Never automatically delete seller files. Preserve upload size, ownership, private-storage, quota, and seller-controlled deletion rules.
- Configure `TRANSLATION_API_URL` to one organization-approved HTTPS LibreTranslate-compatible endpoint; optionally set `TRANSLATION_API_KEY`. Never use public community mirrors or fall back across unrelated hosts. Product names and descriptions are sent to this configured processor, so its privacy and retention terms must be reviewed before use.
- Configure `APP_ALLOWED_ORIGINS` as a comma-separated list of exact trusted origins for the production storefront and approved preview environments. Do not use wildcard origins.
- Translation requests require a verified Supabase user and the service-role-only `consume_translation_rate_limit` RPC. The database enforces 10 requests per minute and 100 per hour per user. If the limiter is unavailable, translation fails closed.
- Keep `SUPABASE_SERVICE_ROLE_KEY` and `TRANSLATION_API_KEY` server-side only. Never prefix them with `VITE_`, expose them to browser code, or include them in logs.
- A successful build is not proof of security. Before merge, run typecheck, lint, unit tests, migration journal checks, SQL security regression tests, and targeted authorization/upload/download/payment tests using isolated test accounts and non-production data.
