# Security operations

This document describes operational requirements for security-sensitive marketplace workflows.
Production migrations and function deployments must follow the reviewed release workflow.

## Translation

The `translate-product` Edge Function uses one organization-approved HTTPS
LibreTranslate-compatible endpoint.

Required Edge Function secrets:
- `TRANSLATION_API_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `APP_ALLOWED_ORIGINS`
- `TRANSLATION_API_KEY` (optional)

Product names and descriptions are sent to the configured translation processor. Review its
retention and privacy terms before configuration.

## Digital-file malware scanning

Seller files are scanned by ClamAV on ephemeral GitHub-hosted Ubuntu runners. No external
malware-scanning vendor is used.

### Trust boundary

- The `product-files` Storage bucket stays private.
- GitHub Actions uses its short-lived OIDC identity token with audience `algorea-file-scan`; no
  Supabase service-role key or long-lived scanner token is stored in GitHub.
- The `github-clamav-scan` Edge Function verifies the OIDC signature and restricts the
  repository, main ref, workflow path, event type, issuer, and audience.
- The Edge Function uses its server-side `SUPABASE_SERVICE_ROLE_KEY` to atomically claim one
  file and issue a 10-minute signed URL.
- The runner downloads only the claimed file into a private temporary directory, checks the
  exact expected size, runs ClamAV, computes SHA-256, reports the result, and removes the
  temporary file.
- Do not print signed URLs, OIDC tokens, file contents, or seller filenames in logs. Do not
  upload files as workflow artifacts or cache them.
- The scheduled workflow checks up to five files per run, every five minutes. A workflow
  dispatch can start an additional scan run.

### Publication and checkout gate

- New and replaced versions begin with `scan_status=pending`.
- The atomic claim RPC changes a pending scan to `scanning`. A stale claim can be reclaimed
  after 15 minutes.
- Only a complete ClamAV clean result with a matching SHA-256 digest can mark a version clean.
- A clean pending upload is activated by the database completion function. Infected and errored
  files remain unavailable; no scan failure falls back to activation.
- Public product reads require an active clean file. Checkout purchase snapshots independently
  require an active clean file and a matching private Storage object.
- Replacing a file creates a new pending version. The previous clean active version remains
  intact until seller-controlled archival/deletion rules are applied.
- No file is automatically deleted by the scanner.

### Failure behavior

- Infected files are marked `infected`; scanner errors and download/size failures are marked
  `error`.
- Timeouts or a runner disappearing leave a reclaimable scan lease. A retry can reclaim it
  after 15 minutes.
- A digest mismatch or missing digest is treated as an error, never as clean.
- Files in pending, scanning, infected, or error states cannot be activated, publicly listed,
  or included in a checkout snapshot.

### Release and validation

1. Deploy the `github-clamav-scan` Edge Function with JWT verification disabled only because it
  validates GitHub OIDC itself; keep its internal OIDC checks mandatory.
2. Apply the `0060_clamav_content_scan_gate` database migration.
3. Confirm the repository Actions setting allows OIDC tokens and that the workflow is enabled
  on the default branch.
4. Test clean, infected, timeout/stale-claim, download failure, malformed result, and digest
  mismatch using harmless fixtures.
5. Confirm existing active files become unlisted until scanned clean; seller file objects are
  retained.
6. Run typecheck, lint, unit tests, migration-journal checks, and SQL regression tests before
  production rollout.

This workflow does not automatically delete seller content or expose the private Storage
bucket.
