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
- Store an immutable snapshot of the selected receiving method, beneficiary name, account identifier, and payment instructions on each order. Display the actual account holder name configured for that receiving account; do not hard-code "Algorea Bazaar" as the beneficiary where that is not the account holder.
- Do not use split payments. The platform calculates seller balances and the 10% commission for each successful sale. Seller payout review and weekly settlement are handled manually by the platform administrator.
- Preserve the financial ledger, order snapshots, audit history, and idempotency. Do not rewrite historical order economics when commission settings change.
- Never collect provider passwords, OTPs, API secrets, or private credentials from buyers or sellers.

## Security operations

- The product-files Storage bucket must remain private. Seller uploads are registered server-side, written to a pending version, and must not become active until the configured malware-scanning service returns the exact verdict `clean`.
- Configure server-only `FILE_SCAN_API_URL` and `FILE_SCAN_API_TOKEN` on the application host before enabling seller uploads. The scanner endpoint must implement the `algorea-file-scan-v1` JSON contract: accept a POST with `fileUrl` (a 120-second signed URL), `fileName`, `mimeType`, and `sizeBytes`; fetch and scan the bytes; return JSON `{"status":"clean"}` or `{"status":"infected"}`. Any timeout, non-2xx response, malformed response, or unknown verdict fails closed and must not activate the file. Never log signed URLs or scanner tokens.
- Configure `TRANSLATION_API_URL` to one organization-approved HTTPS LibreTranslate-compatible endpoint; optionally set `TRANSLATION_API_KEY`. Never use public community mirrors or fall back across unrelated hosts. Product names and descriptions are sent to this configured processor, so its privacy and retention terms must be reviewed before use.
- Configure `APP_ALLOWED_ORIGINS` as a comma-separated list of exact trusted origins for the production storefront and approved preview environments. Do not use wildcard origins.
- Translation requests require a verified Supabase user and the service-role-only `consume_translation_rate_limit` RPC. The database enforces 10 requests per minute and 100 per hour per user. If the limiter is unavailable, translation fails closed.
- Keep `SUPABASE_SERVICE_ROLE_KEY`, `FILE_SCAN_API_TOKEN`, and `TRANSLATION_API_KEY` server-side only. Never prefix them with `VITE_`, expose them to browser code, or include them in logs.
- A successful build is not proof of security. Before merge, run typecheck, lint, unit tests, migration journal checks, SQL security regression tests, and targeted authorization/upload/download/payment tests using isolated test accounts and non-production data.
