// Server-only Gmail API sender. Uses an OAuth refresh token stored in Render secrets.
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
const DEFAULT_FROM = "contact.algoreabazaar@gmail.com";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_${name.toLowerCase()}`);
  return value;
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8").toString("base64")
    .replace(/=/g, "").replace(/\\+/g, "-").replace(/\\//g, "_");
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char] ?? char);
}

export async function getGmailAccessToken(): Promise<string> {
  const clientId = requiredEnv("GOOGLE_OAUTH_CLIENT_ID");
  const clientSecret = requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET");
  const refreshToken = requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("Google OAuth token refresh failed", response.status);
    throw new Error("gmail_auth_unavailable");
  }
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("gmail_auth_unavailable");
  return payload.access_token;
}

export async function sendPurchaseAccessEmail(
  accessToken: string,
  recipient: string,
  appBaseUrl: string,
): Promise<void> {
  const from = (process.env["GMAIL_SENDER_EMAIL"] || DEFAULT_FROM).trim().toLowerCase();
  if (from !== DEFAULT_FROM) throw new Error("gmail_sender_mismatch");
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(recipient)) {
    throw new Error("invalid_recipient");
  }
  const base = new URL(appBaseUrl);
  if (base.protocol !== "https:") throw new Error("app_base_url_must_be_https");
  const ordersUrl = new URL("/orders", base).toString();
  const subject = "Votre achat est disponible — Algorea Bazaar";
  const text = [
    "Bonjour,",
    "",
    "Votre paiement a été confirmé. Votre produit numérique est disponible dans votre espace acheteur.",
    `Accéder à mes achats : ${ordersUrl}`,
    "",
    "Si vous n’êtes pas à l’origine de cet achat, contactez-nous à contact.algoreabazaar@gmail.com.",
    "",
    "Algorea Bazaar",
  ].join("\\r\\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#0A2533">
    <h2>Merci pour votre achat !</h2>
    <p>Votre paiement a été confirmé. Votre produit numérique est disponible dans votre espace acheteur.</p>
    <p><a href="${escapeHtml(ordersUrl)}">Accéder à mes achats</a></p>
    <p>Besoin d’aide ? <a href="mailto:contact.algoreabazaar@gmail.com">Contactez Algorea Bazaar</a>.</p>
    <p>Algorea Bazaar</p></body></html>`;
  const mime = [
    `From: Algorea Bazaar <${from}>`,
    `To: ${recipient}`,
    `Subject: =?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: multipart/alternative; boundary="algorea-mail-boundary"',
    "",
    "--algorea-mail-boundary",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "--algorea-mail-boundary",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "--algorea-mail-boundary--",
  ].join("\\r\\n");
  const response = await fetch(GMAIL_SEND_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ raw: encodeBase64Url(mime) }),
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("Gmail message send failed", response.status);
    throw new Error("gmail_send_failed");
  }
}
