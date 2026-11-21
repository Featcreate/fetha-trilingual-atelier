# Security operations

This document describes operational requirements for security-sensitive marketplace workflows.

## Translation

The `translate-product` Edge Function uses one approved HTTPS LibreTranslate-compatible
endpoint. Keep its service credentials server-side. Product names and descriptions are sent to
that processor, so review its privacy and retention terms before configuration.

## Digital-file malware scanning

Seller files are scanned with ClamAV on ephemeral GitHub-hosted Ubuntu runners.

The runner authenticates through GitHub OIDC to the `github-clamav-scan` Edge Function. No
Supabase service-role key is stored in GitHub. The function issues a short-lived signed URL for
one claimed file and records the result using server-side credentials. ClamAV runs as the
unprivileged `nobody` user with a sanitized environment and no OIDC token.

Only a clean scan with a matching SHA-256 digest can activate a file version. Public product
reads and checkout snapshots require an active clean version. Infected, incomplete, timed-out,
size-mismatched, or unavailable scans remain unavailable. Transient errors retry up to three
attempts; digest mismatches and scan-limit overruns do not retry.

The runner scans uploads up to 50 MB and checks supported archive contents. Seller files must
never appear in Git, workflow logs, artifacts, or caches. Only public ClamAV signature databases
may be cached. The scanner never deletes seller files.

Deploy `github-clamav-scan` with JWT verification disabled only because it performs mandatory
GitHub OIDC validation itself. Apply migration `0060_clamav_content_scan_gate` and test clean,
infected, timeout, unavailable, and digest-mismatch cases before production activation.

## Rollout

1. Deploy the Edge Function after merging the reviewed code.
2. Apply the database migration through the normal migration workflow.
3. Confirm GitHub Actions OIDC is enabled for the repository.
4. Verify that existing files remain stored but hidden until scanned clean.
5. Run the full CI suite and targeted security regressions.
