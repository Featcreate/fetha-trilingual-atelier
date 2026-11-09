# Gmail purchase email delivery

The purchase email outbox is enqueued only after an order transitions to `paid` with `payment_mode = 'verified'`. This worker sends a message containing the buyer's same-origin `/orders` link; it never sends a short-lived storage URL.

## Google OAuth setup

1. In Google Cloud Console, create or select a project and enable the Gmail API.
2. Configure the OAuth consent screen. Keep the app in Testing while validating; add the Gmail account `contact.algoreabazaar@gmail.com` as a test user.
3. Create an OAuth Client ID of type **Desktop app** for a controlled one-time authorization using Google's OAuth 2.0 Playground, or use a Web application client if your organization has a managed callback flow.
4. In OAuth 2.0 Playground settings, enable **Use your own OAuth credentials** and enter the client ID and client secret.
5. Authorize only `https://www.googleapis.com/auth/gmail.send` while signed in as `contact.algoreabazaar@gmail.com`. Exchange the authorization code for tokens and retain the refresh token securely. Never commit or paste tokens into GitHub or chat.
6. If the consent screen remains in Testing, Google may expire refresh tokens after seven days for non-basic scopes. For durable operation, configure the consent screen appropriately and complete Google's verification requirements if prompted.

## Render environment variables

Add these as encrypted Environment Variables on the application service (do not put values in source control):

- `GOOGLE_OAUTH_CLIENT_ID`: OAuth client ID.
- `GOOGLE_OAUTH_CLIENT_SECRET`: OAuth client secret.
- `GOOGLE_OAUTH_REFRESH_TOKEN`: refresh token for the sender account.
- `GMAIL_SENDER_EMAIL`: `contact.algoreabazaar@gmail.com`.
- `EMAIL_WORKER_SECRET`: long random secret used to protect the dispatch endpoint.
- `APP_BASE_URL`: canonical HTTPS origin of Algorea Bazaar (no path), e.g. the verified production/preview origin.

The code does not enable sending until all required variables are present. Keep live sending disabled until a test purchase has been verified and the sender address has been confirmed.

## Dispatch

Invoke `POST /api/internal/email/dispatch` with:

```http
Authorization: Bearer <EMAIL_WORKER_SECRET>
Content-Type: application/json

{"batchSize":10}
```

A Render Cron Job or another trusted scheduler can call this endpoint periodically (for example every 5 minutes). Do not expose the worker secret in browser code. A manual invocation is suitable for the initial controlled test.

## Delivery semantics and operational notes

- The database outbox claim is concurrency-safe and retries failed/stale claims with exponential backoff.
- Gmail's send API and the database completion call are separate systems. If Gmail accepts a message but the process crashes before marking the outbox row sent, a retry can send a duplicate. This is at-least-once delivery, not a strict exactly-once guarantee.
- The worker sends sequentially and caps each batch at 25 messages.
- The existing outbox migration must be applied to the intended Supabase project before dispatch can work. This change does not apply migrations or change Render settings.
- Google OAuth consent and refresh-token acquisition require an authorized human account holder. Do not share passwords, recovery codes, or refresh tokens in chat.
