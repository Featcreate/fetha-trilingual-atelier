import { connect } from "node:tls";
import type { TLSSocket } from "node:tls";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SENDER = "contact.algoreabazaar@gmail.com";

type Audience = "all" | "sellers";

function createSmtpReader(socket: TLSSocket) {
  let buffer = "";
  const lines: string[] = [];
  const waiters: Array<(line: string) => void> = [];
  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    for (;;) {
      const index = buffer.indexOf("\r\n");
      if (index < 0) break;
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 2);
      const waiter = waiters.shift();
      if (waiter) waiter(line);
      else lines.push(line);
    }
  });
  return async function readReply() {
    const response: string[] = [];
    for (;;) {
      const line = lines.length ? lines.shift()! : await new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("smtp_timeout")), 30000);
        waiters.push((value) => { clearTimeout(timer); resolve(value); });
      });
      response.push(line);
      if (/^\d{3} /.test(line)) {
        const code = Number(line.slice(0, 3));
        if (code >= 400) throw new Error("smtp_rejected");
        return code;
      }
      if (!/^\d{3}-/.test(line)) throw new Error("smtp_invalid_response");
    }
  };
}

async function recipients(audience: Audience): Promise<string[]> {
  const emails = new Set<string>();
  const sellerIds = new Set<string>();
  if (audience === "sellers") {
    const { data, error } = await supabaseAdmin.from("stores").select("owner_id").eq("status", "active");
    if (error) throw new Error("recipient_lookup_failed");
    for (const row of data ?? []) sellerIds.add(row.owner_id);
  }

  for (let page = 1; ; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 500 });
    if (error) throw new Error("recipient_lookup_failed");
    for (const user of data.users) {
      if (!user.email || !user.email_confirmed_at) continue;
      if (audience === "sellers" && !sellerIds.has(user.id)) continue;
      emails.add(user.email.trim().toLowerCase());
    }
    if (data.users.length < 500 || page >= 20) break;
  }
  return [...emails];
}

function b64Lines(value: string) {
  const encoded = Buffer.from(value, "utf8").toString("base64");
  return encoded.match(/.{1,76}/g)?.join("\r\n") ?? "";
}

function encodeHeader(value: string) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function sendGmailMessage(to: string[], subject: string, body: string) {
  const password = process.env["GMAIL_APP_PASSWORD"]?.replace(/\s/g, "");
  if (!password) throw new Error("gmail_not_configured");
  if (!to.length) throw new Error("no_recipients");

  const socket = connect({ host: "smtp.gmail.com", port: 465, servername: "smtp.gmail.com" });
  socket.setTimeout(30000, () => socket.destroy(new Error("smtp_timeout")));
  const readReply = createSmtpReader(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  const command = async (line: string) => {
    socket.write(line + "\r\n");
    return readReply();
  };

  try {
    if (await readReply() !== 220) throw new Error("smtp_greeting_failed");
    await command("EHLO algoreabazaar.com");
    await command("AUTH LOGIN");
    await command(Buffer.from(SENDER).toString("base64"));
    await command(Buffer.from(password).toString("base64"));
    await command(`MAIL FROM:<${SENDER}>`);
    for (const address of to) await command(`RCPT TO:<${address}>`);
    await command("DATA");

    const message = [
      `From: Algorea Bazaar <${SENDER}>`,
      "To: undisclosed-recipients:;",
      `Subject: ${encodeHeader(subject)}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${crypto.randomUUID()}@algoreabazaar.com>`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: base64",
      "",
      b64Lines(body),
      ".",
      "",
    ].join("\r\n").replace(/\r\n\.\r\n/g, "\r\n..\r\n");
    socket.write(message);
    await readReply();
    await command("QUIT");
  } finally {
    socket.end();
  }
}

export async function getAnnouncementRecipientCount(audience: Audience) {
  return (await recipients(audience)).length;
}

export async function sendOrderReadyEmail(orderId: string) {
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id,customer_email,email_sent_at,status,order_reference")
    .eq("id", orderId)
    .maybeSingle();
  if (orderError || !order || order.status !== "paid" || !order.customer_email || order.email_sent_at) return;

  const { data: entitlement, error: entitlementError } = await supabaseAdmin
    .from("download_entitlements")
    .select("id")
    .eq("order_id", orderId)
    .limit(1)
    .maybeSingle();
  if (entitlementError || !entitlement) return;

  const claimedAt = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabaseAdmin
    .from("orders")
    .update({ email_sent_at: claimedAt, email_error: null })
    .eq("id", orderId)
    .eq("status", "paid")
    .is("email_sent_at", null)
    .select("id")
    .maybeSingle();
  if (claimError || !claimed) return;

  const site = process.env["PUBLIC_SITE_URL"]?.replace(/\/$/, "");
  const downloadLink = site ? `\n\nAccéder à mes commandes et téléchargements : ${site}/orders` : "";
  const subject = "Vos téléchargements sont prêts — Algorea Bazaar";
  const body = [
    "Bonjour,",
    "",
    "Votre paiement a été confirmé et vos fichiers numériques sont prêts.",
    `Référence de commande : ${order.order_reference || order.id}`,
    downloadLink,
    "",
    "Merci d’avoir choisi Algorea Bazaar.",
  ].join("\n");

  try {
    await sendGmailMessage([order.customer_email], subject, body);
    await supabaseAdmin.from("orders").update({ email_error: null }).eq("id", orderId);
  } catch {
    await supabaseAdmin
      .from("orders")
      .update({ email_sent_at: null, email_error: "email_send_failed" })
      .eq("id", orderId)
      .eq("email_sent_at", claimedAt);
  }
}

export async function sendAnnouncement(input: {
  audience: Audience;
  subject: string;
  body: string;
}) {
  const to = await recipients(input.audience);
  if (to.length === 0) throw new Error("no_recipients");
  await sendGmailMessage(to, input.subject, input.body);
}
