# Algorea Bazaar — Supabase Auth email and redirect setup

## Production Auth settings

- Supabase project: `jgjcychkntsokhzeziqs`
- Production app: `https://fetha-trilingual-atelier-2.onrender.com`
- Set **Authentication → URL Configuration → Site URL** to the production app origin.
- Add `https://fetha-trilingual-atelier-2.onrender.com/**` to the allowed Redirect URLs.
- For local development only, optionally add `http://localhost:3000/**`.

Do not leave the Site URL at `http://localhost:3000`. The application now explicitly sends production signup confirmations to `/account` and password recovery to `/reset-password`. Production builds use the canonical Render origin; local development retains its local origin. `VITE_APP_URL` can override the canonical origin if a verified custom domain is adopted later.

## Production email delivery

Supabase's built-in email sender is intended for evaluation, not public production use. It restricts recipients to pre-authorized organization addresses and enforces strict rate limits. Production signup and password recovery require a custom SMTP provider.

Configure the provider's verified SMTP host, port, username, password, and sender address in **Supabase Dashboard → Authentication → SMTP Settings**. Do not commit SMTP credentials to GitHub or expose them through Vite client variables.

Use a sender address on a domain controlled by Algorea Bazaar. Complete SPF and DKIM verification (and preferably DMARC). Disable click tracking or link rewriting for authentication messages so one-time verification links are not modified or consumed by link scanners.

## Authentication email templates

In **Authentication → Email Templates**:

- Confirm signup: use `{{ .ConfirmationURL }}` for the confirmation link.
- Reset password: use `{{ .ConfirmationURL }}` for the recovery link.
- Do not hardcode `localhost` in either template.
- If a template constructs a custom redirect, use the approved `{{ .RedirectTo }}` and keep it within the Redirect URLs allow list.

If email security scanners consume one-time links before the user opens them, change the template to deliver `{{ .Token }}` and add a dedicated OTP-entry flow. Do not disable email confirmation as a workaround.

## Production diagnostic evidence — 2026-11-04

Read-only inspection of the original project's Auth logs and Auth user record established:

- The owner account already exists and its email is confirmed. Repeated signup attempts were logged as `user_repeated_signup`; they do not create another account.
- Password recovery attempts returned `429 over_email_send_rate_limit` / `email rate limit exceeded`.
- Some verification requests returned `One-time token not found`, consistent with a consumed, expired, or reused one-time link.
- The inspected Auth requests carried a `http://localhost:3000` referer, so the local origin was involved in those test attempts.

The code change makes production auth redirects use the Render origin and prevents a pre-existing signed-in session from unlocking the password reset form. It does not alter hosted Supabase Auth configuration or create SMTP credentials. Those dashboard settings require a configured SMTP provider and its credentials.
