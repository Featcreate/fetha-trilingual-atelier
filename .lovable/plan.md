# Diagnostic report: iPay hourly reconciliation (read-only, commit de1bbc3)

No changes were made. I did not have access to the real Render or GitHub settings, so I cannot confirm they are set correctly.

## 1. Settings Render must have, and where the code reads them
Read only on the server, at runtime, through `process.env`:
- `IPAY_RECONCILE_CRON_SECRET`: read in `src/routes/api/public/ipay.webhook.ts` (line 22), trimmed, then compared in constant time with the `x-ipay-reconcile-secret` header.
- `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`: read in `src/integrations/supabase/client.server.ts` (lines 36-37). The client is only created when `supabaseAdmin` is first used (lazy proxy), called from `src/lib/ipay-settlement.server.ts` line 165.
- `IPAY_ORG_ID` and `IPAY_JWT`: read in `ipay-settlement.server.ts` (lines 64-65). If either is missing, the error is `ipay_not_configured`.
- The `VITE_SUPABASE_*` variables are a separate thing. They are baked into the browser bundle at build time and the server key does not use them. `SUPABASE_URL` is a different variable that must be added on its own.

GitHub needs only the repository secret `IPAY_RECONCILE_CRON_SECRET`.

## 2. Why "Missing ... SUPABASE_SERVICE_ROLE_KEY" can still appear
The code shows this message only when `process.env["SUPABASE_SERVICE_ROLE_KEY"]` is empty in the running process. Likely causes (none confirmed):
1. The variable was saved on a different Render service, or in an Environment Group not linked to the web service.
2. The variable was added but the service was not redeployed or restarted, so the old process is still running.
3. The name is wrong: extra spaces, wrong case, a `VITE_` prefix, or a similar name like `SUPABASE_SERVICE_KEY`.
4. The value is empty, or it was put only in a build-time file such as `.env` and not in the runtime environment.
5. A different message is easy to confuse with this one: if `SUPABASE_URL` is missing, the list names it explicitly.
6. The error comes from an older deploy (check the commit SHA of the live deploy).

Note: the endpoint turns this error into 503 "Reconciliation temporarily unavailable". The text only appears in the Render logs. The route also checks the secret before it touches the database, so a 401 means the database step was never reached.

## 3. Any dependency on Lovable Cloud in production on Render?
In the code, none: the server client connects to whatever `SUPABASE_URL` and key it finds in the environment. The text "Connect Supabase in Lovable Cloud" is a fixed message in a generated file, nothing more. However, the tracked `.env` file (restored to point at the reference project) affects the build only if Render reads it during the build. It does not provide `SUPABASE_SERVICE_ROLE_KEY`.

## 4. Checking safely without exposing values
- In the Render dashboard: check that each name exists on the correct service, then check the SHA of the latest deploy after saving.
- Compare fingerprints: the workflow prints the first 12 characters of a SHA-256 hash and the length of its secret. When authentication fails, the route logs `expectedPresent`, `expectedLength` and `expectedFingerprint`. They should match exactly.
- For the database key, Render logs only show whether it is present (the error message names the missing variable). Do not use any command that prints values, such as `env` or `echo`. Only presence and length are safe to show.
- Response codes from `workflow_dispatch`: 401 means a secret mismatch; 503 means a database or iPay setting problem, so check the Render logs; 200 with `summary` means success.

## 5. Differences between the workflow and the route
- They match on the header name `x-ipay-reconcile-secret`, the POST method, and the path `/api/public/ipay/webhook`.
- The route trims spaces from both values. The workflow fingerprint does not trim, so stray spaces in the GitHub secret would give different fingerprints even though authentication succeeds.
- The URL is hard-coded to `algorea-bazaar.onrender.com`. The schedule is minute 17 of every hour (UTC). There is no body, which is correct because the secret path does not read one.
- `--fail-with-body` makes the job fail on 401/503 without showing why. The cause is only in the Render logs.

## Not verified
The actual Render settings, the GitHub secrets, the live deploy SHA, and whether the reference database accepts the key.
