# Algorea Bazaar — readiness notes

This document records implementation boundaries for the current GitHub work branch. It does not authorize database changes or production activation.

## Current seller workflow

- Store creation is available from the authenticated account page.
- Product metadata can be saved as an unpublished draft.
- Draft creation does not upload files, publish products, create orders, or enable payments.
- The product type values currently accepted by the migration are: `ebook`, `template`, `printable`, `planner`, `course`, `software`, `audio`, `video`, `graphics`, and `other`.

## Verified implementation constraints

1. On this work branch, migrations 0006–0007 add a database-side verified-email helper and require verified email plus current legal-acceptance versions for store creation through the `create_seller_store` RPC and INSERT policy. These migrations have NOT been applied to a live database; until the intended Supabase project and migration history are reconciled and the migrations are separately approved/applied, the live database must not be assumed to enforce these new guards.
2. The migration defines a private `product-files` bucket workflow. Seller upload must first call `register_file_version`, upload only to the returned path, then call `activate_file_version`. Never expose a public bucket or allow arbitrary object paths.
3. The migration limits each file to 50 MiB and checks the uploaded object's recorded size before activation. The application should also validate size before requesting registration and handle upload failure without activating the version.
4. `product_file_versions` rows are immutable apart from controlled status transitions. Do not delete versions or overwrite existing storage objects.
5. Product publication must remain disabled until the server-side rules require at least one active downloadable file and verify all other publication requirements. Do not set `products.is_active = true` from the browser without those guarantees.
6. Current database product-type constraint does not yet include every planned marketplace type (for example `pdf`, `educational`, `bundle`, and `app`). Do not offer values rejected by the database. Expand the constraint only through a separately reviewed migration after database reconciliation.

## Confirmed seller experience requirements

- Registration asks for first and last name, email, and password only; no phone, commercial registration, identity document, or other administrative document is required to open a store.
- Sellers must confirm their email and separately accept the Privacy Policy and Seller Terms.
- Seller onboarding has no platform-side country, nationality, or residence restriction. Every seller is shown the same platform Konnect referral registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a.
- Konnect alone decides whether it accepts each seller and what identity, phone, bank, residence, or other verification it requires. Do not promise acceptance or add provider eligibility checks to Algorea Bazaar.
- The referral link does not automatically link a seller wallet, enable split payments, or enable payouts. Weekly manual transfers remain the current payout workflow; do not block store creation or product listings while provider onboarding is incomplete.
- At payout time, sellers choose from methods they previously configured and that are actually eligible. Weekly manual transfer remains the default until providers confirm direct transfers.
- Seller dashboard scope: products, orders, earnings, payout history/settings, storefront preview, store settings, and support.

## Database reconciliation — blocking

- Repository migration journal contains eight migration entries (0000–0007).
- The previously inspected live migration table returned seven rows; the seventh row has not yet been identified.
- Repository `supabase/config.toml` points to project ref `vjqeuvvnavsdjzdqfyrs`; a separately inspected Supabase project used ref `iblfizhtvzfnfuntnazk`.
- Confirm the intended Supabase project and reconcile the exact migration history before applying any migration.
- Do not run migrations, SQL, resets, or destructive operations as part of this branch work.

## Payment and launch boundaries

- Live payments remain disabled.
- No payment provider integration or payout automation is authorized by this readiness work.
- Seller registration asks only for first and last name, email, and password. Phone number and identity/business documents are not prerequisites to opening a store.
- Email confirmation and separate acceptance of the Privacy Policy and Seller Terms remain required.
- Every seller, regardless of country, nationality, or residence, sees the same platform Konnect referral-registration link: https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a. Konnect alone determines seller account eligibility and verification requirements. Do not route sellers by country or use iPay as an automatic foreign-seller fallback. The link is for registration only; it does not automatically link wallets or enable payouts.
- At withdrawal, sellers choose only among payout methods they previously configured and that are actually eligible. Record the selected method for each payout.
- Weekly manual seller transfers remain the default until providers confirm direct seller-wallet transfers. The 5% platform commission is separate from external provider fees.
- Do not block store creation or product listing while payout onboarding is incomplete. Do not enable real payouts until provider support, country coverage, and transfer mechanics are verified.
- Seller dashboard scope: products, orders, earnings, payout history/settings, storefront preview, store settings, and support. Mark payment-dependent features unavailable until live payments are approved.
- The platform's planned commission remains 5%; seller registration, store creation, and product listing must remain free.
- Do not merge this branch or deploy production changes without a separate review.
