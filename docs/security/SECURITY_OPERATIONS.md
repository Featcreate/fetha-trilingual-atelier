# Security operations

This document describes the operational configuration required by the security hardening branch. It does not authorize production changes; apply the migration and host settings only after review and approval.

## Translation

The `translate-product` Edge Function no longer uses a list of public community mirrors.

Required Supabase Edge Function secrets:

- `TRANSLATION_API_URL`: base URL of one approved HTTPS LibreTranslate-compatible service. Do not include credentials, query parameters, or a fragment.
- `SUPABASE_SERVICE_ROLE_KEY`: required by the function to call the private database rate-limit RPC. Keep it server-side.
- `APP_ALLOWED_ORIGINS`: comma-separated exact origins, for example `https://algorea-bazaar.onrender.com,https://approved-preview.example`. Add only origins that are actually controlled by the project.
- `TRANSLATION_API_KEY`: optional provider key, sent only to the configured provider in its request body.

The endpoint accepts only authenticated POST requests. It permits 10 requests per user per minute and 100 per user per hour. A missing limiter configuration or database error fails closed. Product names and descriptions are disclosed to the configured translation processor; review its retention, training, and subprocessors before setting the URL.

## Digital-file malware scanning (deferred)

Malware scanning is not enabled in the launch workflow. Do not require scanner secrets or block seller file activation while no approved no-cost scanner is configured. Do not transmit seller files to an external scanning service without an explicit decision.

- `FILE_SCAN_API_URL`: HTTPS endpoint controlled by an approved scanning service.
- `FILE_SCAN_API_TOKEN`: bearer token for that service.

If a no-cost approved scanner is selected later, its integration must be separately reviewed before any files are sent externally. The previous proposed contract was:

```json
{
  "contract": "algorea-file-scan-v1",
  "fileUrl": "<120-second signed URL>",
  "fileName": "example.pdf",
  "mimeType": "application/pdf",
  "sizeBytes": 12345
}
```

The scanner must fetch the signed URL promptly, scan the complete file bytes (including archive contents under its own safe extraction limits), and return exactly one of:

```json
{
  "status": "clean"
}
```

or

```json
{
  "status": "infected"
}
```

The scanner integration is deferred. The application must not depend on these secrets at launch.

Before production rollout, test clean, infected, malformed-response, timeout, and scanner-unavailable cases using harmless test fixtures. Confirm the scanner has a file-size limit at least as large as the configured 50 MB upload maximum, or reduce the accepted upload limit to the scanner's supported maximum.

## Rollout checklist

1. Review provider privacy and retention terms.
2. Keep malware scanning deferred unless a no-cost approved solution is explicitly selected.
3. Set the secrets in the correct server-side environments; never use `VITE_` prefixes for secrets.
4. Apply the new database migration through the normal migration workflow.
5. Test translation CORS, authentication, throttling, and provider outage behavior.
6. Test file scanning outcomes and confirm only clean files become active.
7. Run typecheck, lint, unit tests, migration checks, and isolated integration/security tests.
8. Only then consider a separate, explicitly approved production deployment.

This branch does not provision a scanner, change hosting secrets, apply a production migration, or deploy the application.
