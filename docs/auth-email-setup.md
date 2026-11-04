# Algorea Bazaar — Supabase Auth email and redirect setup

## Verified production project

- Supabase project ref: `jgjcychkntsokhzeziqs`
- Production app origin: `https://fetha-trilingual-atelier-2.onrender.com`
- Production redirect URLs must include:
  - `https://fetha-trilingual-atelier-2.onrender.com/**`
- Local development may additionally allow:
  - `http://localhost:3000/**`

Set the Supabase Auth **Site URL** to the production app origin. Do not leave it at `http://localhost:3000`. Keep the production and local development redirect entries separate.

The application now sends signup confirmation to `/account` and password recovery to `/reset-password`. Production builds use the canonical Render origin; local development uses its local origin. An optional `VITE_APP_URL` build variable can override the canonical origin when a verified custom domain is adopted.

## Email delivery requirement

The Supabase default email service is for evaluation only. It restricts delivery to pre-authorized organization addresses and applies strict rate limits. Production signup and password recovery require a configured custom SMTP provider.

Configure SMTP in **Supabase Dashboard → Authentication → SMTP Settings** with the provider's verified SMTP host, port, username, password, and sender address. Do not commit SMTP credentials to GitHub or expose them in Vite environment variables.

Use a sender address on a domain controlled by Algorea Bazaar and complete the provider's SPF/DKIM (and preferably DMARC) DNS verification. Disable click tracking/link rewriting for authentication messages so one-time Supabase links are not altered or consumed by link scanners.

## Email templates

In **Authentication → Email Templates**:

- Confirm signup: use the Supabase `{{ .ConfirmationURL }}` variable for the confirmation link.
- Reset password: use the Supabase `{{ .ConfirmationURL }}` variable for the recovery link.
- Do not hardcode `localhost` in either template.
- If a custom template constructs its own redirect, use the configured `{{ .RedirectTo }}` value and ensure it remains within the redirect allow list.

If email security scanners consume one-time links before the user opens them, switch the template to deliver `{{ .Token }}` and implement an OTP-entry flow rather than relying on a direct one-time link. Do not disable email confirmation to work around delivery problems.

## Diagnostic findings — 2026-11-04

Read-only inspection of the original production project's Auth logs found:

- Repeated signup requests were classified as `user_repeated_signup`; the email identity already existed.
- The existing owner account was confirmed in Auth. No duplicate account should be created.
- Password recovery requests returned `429 over_email_send_rate_limit` / `email rate limit exceeded`.
- Some verification attempts returned `One-time token not found`, consistent with a previously consumed, expired, or reused one-time link.
- Auth requests in the inspected logs carried a `http://localhost:3000` referer, demonstrating that the local development origin was being used during those attempts.

The repository change fixes production redirect selection and prevents an unrelated pre-existing login session from unlocking the password reset form. It does not change hosted Supabase Auth settings or configure SMTP. Those require the dashboard and SMTP provider credentials.
