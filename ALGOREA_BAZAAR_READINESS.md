# Algorea Bazaar — readiness notes

This document records implementation boundaries for the current GitHub work branch. It does not authorize database changes or production activation.

## Current seller workflow

- Store creation is available from the authenticated account page.
- Product metadata can be saved as an unpublished draft.
- Draft creation does not upload files, publish products, create orders, or enable payments.
- The product type values currently accepted by the migration are: `ebook`, `template`, `printable`, `planner`, `course`, `software`, `audio`, `video`, `graphics`, and `other`.

## Verified implementation constraints

1. Store insert RLS currently checks `owner_id = auth.uid()` and `status = 'active'`, but does not itself check `auth.jwt() ->> 'email_confirmed_at'`. The client checks `user.email_confirmed_at`; this is a UI gate, not a database-enforced email-verification guarantee. Before relying on this as a security boundary, enforce the verification requirement in a trusted server-side/database policy or function.
2. The migration defines a private `product-files` bucket workflow. Seller upload must first call `register_file_version`, upload only to the returned path, then call `activate_file_version`. Never expose a public bucket or allow arbitrary object paths.
3. The migration limits each file to 50 MiB and checks the uploaded object's recorded size before activation. The application should also validate size before requesting registration and handle upload failure without activating the version.
4. `product_file_versions` rows are immutable apart from controlled status transitions. Do not delete versions or overwrite existing storage objects.
5. Product publication must remain disabled until the server-side rules require at least one active downloadable file and verify all other publication requirements. Do not set `products.is_active = true` from the browser without those guarantees.
6. Current database product-type constraint does not yet include every planned marketplace type (for example `pdf`, `educational`, `bundle`, and `app`). Do not offer values rejected by the database. Expand the constraint only through a separately reviewed migration after database reconciliation.

## Database reconciliation — blocking

- Repository migration journal contains six migration entries.
- The previously inspected live migration table returned seven rows; the seventh row has not yet been identified.
- Repository `supabase/config.toml` points to project ref `vjqeuvvnavsdjzdqfyrs`; a separately inspected Supabase project used ref `iblfizhtvzfnfuntnazk`.
- Confirm the intended Supabase project and reconcile the exact migration history before applying any migration.
- Do not run migrations, SQL, resets, or destructive operations as part of this branch work.

## Payment and launch boundaries

- Live payments remain disabled.
- No payment provider integration or payout automation is authorized by this readiness work.
- The platform's planned commission remains 5%; seller registration, store creation, and product listing must remain free.
- Do not merge this branch or deploy production changes without a separate review.
