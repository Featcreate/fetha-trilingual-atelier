// Server-only iPay one-shot API client. Import dynamically from server handlers.
// Checkout remains disabled unless explicitly enabled. TND amounts are sent in dinars.
const IPAY_API = "https://api.ipay.tn";
const IPAY_REQUEST_TIMEOUT_MS = 15_000;

export type IpayConfig = {
  orgId: string;
  jwt: string;
  productCode: string;
};

/** Both the admin switch and the independent server-side environment gate must be on. */
export function isIpayCheckoutEnabled(
  adminEnabled: boolean,
  envEnabled = process.env["IPAY_CHECKOUT_ENABLED"],
): boolean {
  return adminEnabled && envEnabled === "true";
}

export function ipayConfig(requireActivation = false): IpayConfig | null {
  const orgId = process.env["IPAY_ORG_ID"];
  const jwt = process.env["IPAY_JWT"];
  const productCode = process.env["IPAY_PRODUCT_CODE"];
  if (!orgId || !jwt || !productCode) return null;
  if (requireActivation && process.env["IPAY_CHECKOUT_ENABLED"] !== "true") {
    return null;
  }
  return { orgId, jwt, productCode };
}

/** Convert the canonical TND millime total to the dinar amount expected by iPay. */
export function ipayAmountFromMillimes(amountMillimes: number): number {
  if (!Number.isSafeInteger(amountMillimes) || amountMillimes <= 0) {
    throw new Error("invalid_order_amount");
  }
  return amountMillimes / 1000;
}

function ipayResponseAmountToMillimes(value: unknown): number {
  const raw =
    typeof value === "number" && Number.isFinite(value)
      ? String(value)
      : typeof value === "string"
        ? value.trim()
        : "";
  if (!/^\\d+(?:\\.\\d{1,3})?$/.test(raw)) {
    throw new Error("ipay_invalid_response");
  }
  const [whole, fraction = ""] = raw.split(".");
  const amountMillimes = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(amountMillimes) || amountMillimes <= 0) {
    throw new Error("ipay_invalid_response");
  }
  return amountMillimes;
}

/** Validate the provider response against the exact checkout request before exposing its URL. */
export function parseIpayOneShotResponse(
  payload: unknown,
  expected?: { amountMillimes: number; orderId: string },
): {
  paymentUrl: string;
  paymentRef: string;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("ipay_invalid_response");
  }

  const record = payload as {
    id?: unknown;
    payment_url?: unknown;
    amount?: unknown;
    currency?: unknown;
    invoice_reference?: unknown;
  };
  if (
    (typeof record.id !== "string" && typeof record.id !== "number") ||
    typeof record.payment_url !== "string" ||
    (typeof record.amount !== "string" && typeof record.amount !== "number") ||
    typeof record.currency !== "string" ||
    typeof record.invoice_reference !== "string"
  ) {
    throw new Error("ipay_invalid_response");
  }

  const paymentRef = String(record.id).trim();
  const invoiceReference = record.invoice_reference.trim();
  if (!paymentRef || paymentRef.length > 200 || !invoiceReference) {
    throw new Error("ipay_invalid_response");
  }
  if (record.currency.trim().toUpperCase() !== "TND") {
    throw new Error("ipay_response_currency_mismatch");
  }
  const responseAmountMillimes = ipayResponseAmountToMillimes(record.amount);
  if (expected && invoiceReference !== expected.orderId) {
    throw new Error("ipay_response_invoice_mismatch");
  }
  if (expected && responseAmountMillimes !== expected.amountMillimes) {
    throw new Error("ipay_response_amount_mismatch");
  }

  let paymentUrl: URL;
  try {
    paymentUrl = new URL(record.payment_url);
  } catch {
    throw new Error("ipay_invalid_payment_url");
  }

  const allowedHost = paymentUrl.hostname === "ipay.tn" || paymentUrl.hostname.endsWith(".ipay.tn");
  if (
    paymentUrl.protocol !== "https:" ||
    !allowedHost ||
    paymentUrl.username !== "" ||
    paymentUrl.password !== "" ||
    (paymentUrl.port !== "" && paymentUrl.port !== "443")
  ) {
    throw new Error("ipay_invalid_payment_url");
  }

  return { paymentUrl: paymentUrl.toString(), paymentRef };
}

export async function ipayCreateOneShot(input: {
  amountMillimes: number;
  orderId: string;
  customerName: string;
}): Promise<{ paymentUrl: string; paymentRef: string }> {
  const cfg = ipayConfig(true);
  if (!cfg) throw new Error("ipay_not_configured");
  if (!input.orderId.trim() || input.orderId.length > 100) {
    throw new Error("invalid_order_reference");
  }
  const customerName = input.customerName.trim();
  if (!customerName || customerName.length > 160) {
    throw new Error("invalid_customer_name");
  }

  const response = await fetch(`${IPAY_API}/api/admin/transactions/create-oneshot`, {
    method: "POST",
    signal: AbortSignal.timeout(IPAY_REQUEST_TIMEOUT_MS),
    headers: {
      "X-Org-Id": cfg.orgId,
      Authorization: `Bearer ${cfg.jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      product_code: cfg.productCode,
      amount: ipayAmountFromMillimes(input.amountMillimes),
      currency: "TND",
      customer_name: customerName,
      customer_external_id: input.orderId,
      invoice_reference: input.orderId,
    }),
  });

  if (!response.ok) {
    console.error("iPay create-oneshot failed", response.status);
    throw new Error("ipay_provider_error");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ipay_invalid_response");
  }
  return parseIpayOneShotResponse(payload, input);
}

/**
 * Read-only provider-side webhook configuration health check.
 * This never creates a transaction and does not enable checkout.
 */
export async function ipayGetWebhookHealth(probe = false): Promise<unknown> {
  const cfg = ipayConfig(false);
  if (!cfg) throw new Error("ipay_not_configured");

  const url = new URL("/api/admin/webhooks/health", IPAY_API);
  if (probe) url.searchParams.set("probe", "true");

  const response = await fetch(url, {
    method: "GET",
    signal: AbortSignal.timeout(IPAY_REQUEST_TIMEOUT_MS),
    headers: {
      "X-Org-Id": cfg.orgId,
      Authorization: `Bearer ${cfg.jwt}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    console.error("iPay webhook health check failed", response.status);
    throw new Error("ipay_health_check_failed");
  }

  try {
    return await response.json();
  } catch {
    throw new Error("ipay_invalid_health_response");
  }
}

/** Keep ambiguous initialization states explicit; callers must never retry them automatically. */
export function ipayInitClaimError(outcome: unknown): string {
  switch (outcome) {
    case "not_found":
      return "order_not_found";
    case "order_closed":
      return "order_closed";
    case "provider_conflict":
      return "provider_conflict";
    case "in_progress":
      return "payment_initialization_in_progress";
    default:
      return "payment_initialization_uncertain";
  }
}
