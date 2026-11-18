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

## Authoritative financial model

- Buyer payments are collected for Algorea Bazaar and settled only to the platform's own merchant/settlement account.
- The payment provider is a collection/settlement rail only. It must never split payments, hold seller balances on the platform's behalf, or distribute seller proceeds directly.
- Algorea Bazaar's internal financial system is the sole source of truth for collections, actual settlement records, FX snapshots, the configurable 5% default commission, seller payable balances, and payout records.
- Canonical product accounting, commission, seller payable, and Phase 1 seller payouts are denominated in TND. Current buyer checkout is also TND-only; a foreign card issuer may convert the TND charge into the buyer's billing currency. Do not claim local-currency checkout until the provider-specific FX flow is implemented and verified.
- Algorea Bazaar alone initiates seller transfers. Weekly manual transfer is the default. No provider API may initiate seller payouts; direct Konnect payout capability must remain disabled.
- Migration 0022 is applied to the original Supabase project jgjcychkntsokhzeziqs and recorded in its migration history. The append-only platform financial ledger, immutable buyer/settlement snapshot controls, and weekly/manual-only payout constraints are active. The database has zero orders, order items, payout batches and payout preferences as of 2026-11-03.
- The current checkout adapter is Konnect and sends TND only. Its public documentation lists international Visa/Mastercard acceptance; the provider must still approve the exact digital multi-vendor, platform-as-sole-collection-beneficiary model in writing before checkout activation.
- The current payment activation helper is fail-closed. No sandbox or live payment credentials/settings were changed, and no live payment is active.


## Engineering baseline and project identity

Algorea Bazaar is a multilingual marketplace for downloadable digital products only. The current stack is React, TypeScript, TanStack Start, Vite, Supabase Auth/PostgreSQL/Storage, Drizzle migrations and Bun. Minimum Node.js is 22.12.0. French is the default language, Arabic uses RTL and Tajawal, and English uses LTR.

## Owner control, extensibility and future development

The owner must always retain the practical ability to evolve the platform, change providers, add features, and adjust business rules without unnecessary rewrites or losing control of the code, data, domains, or infrastructure.

- Prefer modular, cohesive components with clear boundaries between presentation, business logic, persistence, and external integrations.
- Put payment, email, storage, analytics and other external providers behind replaceable adapters/interfaces where practical. Document provider-specific assumptions and replacement paths.
- Keep business rules and operational limits configurable where appropriate; avoid scattering important constants throughout the codebase.
- Prefer backward-compatible, additive database migrations and staged rollouts. Preserve stable IDs, routes, stored data contracts and existing integrations unless an approved migration plan exists.
- Before removing or replacing a feature, identify affected users, data, dependencies, migration steps and rollback/forward-recovery options.
- Use feature flags for significant changes when appropriate, and document architecture decisions and configuration.
- Avoid unnecessary vendor lock-in and over-engineering. Choose the simplest design that leaves a practical path for future extension.
- Never make a change that silently removes the owner's administrative control or ability to maintain the platform.

## Security and customer-data protection — mandatory

Customer accounts, personal information, orders, seller information, financial records and private digital files are sensitive. Security and privacy must be assessed for every feature, dependency, migration and deployment. No checklist can guarantee that hacking is impossible; the goal is to reduce attack surface, prevent common vulnerabilities, detect attacks early, limit damage and recover safely. Never claim the platform is completely secure.

### Authentication and authorization
- Enforce authorization on the server; hiding UI controls is not access control.
- Apply least privilege to users, administrators, service credentials, integrations and infrastructure.
- Check ownership and permissions on every sensitive object: stores, products, orders, downloads and uploaded files. Prevent cross-user/cross-seller access and insecure direct object references.
- Preserve and test Supabase Row Level Security (RLS). Do not disable policies to make a feature work.
- Protect administrator operations with server-side role checks and audit trails. Use secure session, cookie and account-recovery settings.

### Application and API defenses
- Validate all untrusted input on the server using explicit schemas; use parameterized database queries.
- Review changes for SQL injection, XSS, CSRF, SSRF, path traversal, open redirects, unsafe file handling and authorization bypass.
- Rate-limit login, signup, password recovery, checkout, webhooks, uploads and download endpoints.
- Verify webhook signatures or equivalent provider authentication; enforce idempotency and reject forged or replayed events.
- Configure CORS, security headers, content types and upload restrictions deliberately. Do not expose stack traces, internal errors or database details to users.

### Personal data and private files
- Collect only data necessary for the feature and restrict access by role and business need.
- Keep digital downloads in private storage. Authorize each download and use short-lived signed URLs.
- Never place private customer data in public URLs, source maps, analytics events, screenshots, test fixtures or logs.
- Define appropriate retention and deletion rules; do not delete customer or financial records without an approved policy.
- Use HTTPS/TLS in transit and verify the provider's encryption-at-rest protections. Protect backups with access controls and periodically test restoration.

### Secrets and infrastructure
- Keep service-role keys and provider secrets server-side only. Never expose secrets through `VITE_` variables or browser bundles.
- Use separate least-privilege credentials for development, testing and production.
- Rotate exposed or suspected-compromised credentials promptly and investigate possible misuse.
- Do not print secret values during debugging; report only safe presence/status checks.
- Review dependency advisories, remove unused dependencies and run security checks where available.

### Security testing and incident readiness
- Threat-model major changes involving authentication, payments, uploads, downloads, customer data or administration.
- Add tests for RLS, role boundaries, cross-account access, input validation, upload/download permissions, webhook forgery/replay and rate limits.
- Review security-relevant logs and alerts for suspicious logins, privilege changes, unusual downloads and payment anomalies without logging sensitive payloads.
- Maintain an incident procedure: contain the issue, preserve evidence, rotate affected credentials, assess data exposure, restore safe operation and follow applicable notification obligations.
- Reassess security after major dependency, architecture, provider or infrastructure changes.

## Database, storage and migration safety

- Inspect existing migrations and migration-journal consistency before creating new ones.
- Test migrations on a disposable database before production; do not assume a separate Supabase project is production.
- Preserve RLS, ownership checks, append-only financial records, immutable purchase snapshots, entitlements and audit history.
- Prefer additive, backward-compatible migrations. Document rollback or forward-recovery; do not assume every migration can safely be rolled back.
- Keep product files private. Validate file size, type, filename and content as appropriate; do not trust browser-provided MIME types alone.
- Protect upload/processing paths against malicious files and resource exhaustion.
- Preserve existing storage limits and seller-controlled retention behavior unless inspected and explicitly approved.

## Marketplace and taxonomy guardrails

The approved taxonomy has exactly ten categories: Graphisme; Modèles; Livres numériques; Ressources éducatives; Agendas et organisation; Logiciels et applications; Contenus audio et visuels; Formations et cours; Création et fabrication numérique; Packs et bundles numériques. Its implementation is `src/lib/product-categories.ts`. Preserve category IDs and multilingual labels; do not add duplicates or change the approved taxonomy without explicit approval.

Add all user-facing strings to the French, Arabic and English dictionaries. Verify Arabic RTL and mobile layouts after UI changes.

## Financial and payment safety

- Verify the latest owner-approved business policy before changing commission, fees, checkout, seller balances or payouts; repository documentation may lag behind later decisions.
- Preserve immutable price and commission snapshots. Use integer millimes for TND; never use binary floating-point for money.
- Keep gross sales, commission, external fees, seller payable, refunds, chargebacks and payouts as separate accounting entries.
- Allocate only actual, evidenced external fees. Never guess a fee or deduct it twice.
- Never initiate payments, refunds or transfers without explicit authorization.
- Provider credentials do not authorize checkout activation. Verify provider terms, server-side payment confirmation, webhook security, idempotency and reconciliation first.
- Never log card data, payment credentials, authentication tokens or unnecessary personal data.

## Development, verification and deployment

Available scripts:
```bash
bun install
bun run dev
bun run test
bun run lint
bun run typecheck
bun run build
bun run check:migrations
```

Run relevant checks after changes; run the full suite where practical. A successful build does not prove authorization, payment, storage or database behavior is correct. Test affected workflows and security boundaries separately.

Before deployment: review the diff and security impact; verify target branch and commit; run tests and security checks; inspect migration/data-retention impact; confirm environment requirements without exposing values; verify backups/recovery for high-risk changes; and obtain explicit deployment approval. After deployment, verify actual service status, deployed commit SHA and critical workflows. A GitHub commit alone is not proof of deployment.

For every task, report objective, files inspected/changed, implementation, actual test results, security/privacy checks, migration and recovery considerations, deployment status and remaining risks. If evidence is missing, say verification is incomplete. Never label an untested change as secure.

## Non-negotiable priority

Protect customer data, seller funds, payment integrity, database security and production stability before adding features. Preserve the owner's ability to continue changing the platform. When requirements conflict or the latest business decision is unclear, stop and ask rather than silently changing policy.
