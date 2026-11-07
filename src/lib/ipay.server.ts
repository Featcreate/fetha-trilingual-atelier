// Server-only iPay one-shot API client. Import dynamically from server handlers.
// Checkout remains disabled unless explicitly enabled. TND amounts default to millimes
// (minor units), a provisional assumption pending a non-settling sandbox confirmation.
const IPAY_API = "https://api.ipay.tn";

export type IpayConfig = {
  orgId: string;
  jwt: string;
  productCode: string;
  amountUnit: "major" | "minor";
};

export function ipayConfig(requireActivation = false): IpayConfig | null {
  const orgId = process.env["IPAY_ORG_ID"];
  const jwt = process.env["IPAY_JWT"];
  const productCode = process.env["IPAY_PRODUCT_CODE"];
  const amountUnit = process.env["IPAY_AMOUNT_UNIT"] ?? "minor";
  if (!orgId || !jwt || !productCode) return null;
  if (amountUnit !== "major" && amountUnit !== "minor") return null;
  if (requireActivation && process.env["IPAY_CHECKOUT_ENABLED"] !== "true") return null;
  return { orgId, jwt, productCode, amountUnit };
}

/** Convert canonical TND millimes to the configured iPay amount unit. */
export function ipayAmountFromMillimes(
  amountMillimes: number,
  unit: IpayConfig["amountUnit"],
): number {
  if (!Number.isSafeInteger(amountMillimes) || amountMillimes <= 0) {
    throw new Error("invalid_order_amount");
  }
  return unit === "minor" ? amountMillimes : amountMillimes / 1000;
}

/** Validate the provider response before exposing its hosted URL to a buyer. */
export function parseIpayOneShotResponse(payload: unknown): {
  paymentUrl: string;
  paymentRef: string;
} {
  if (!payload || typeof payload !== "object") {
    throw new Error("ipay_invalid_response");
  }

  const record = payload as { id?: unknown; payment_url?: unknown };
  if (
    (typeof record.id !== "string" && typeof record.id !== "number") ||
    typeof record.payment_url !== "string"
  ) {
    throw new Error("ipay_invalid_response");
  }

  const paymentRef = String(record.id).trim();
  if (!paymentRef || paymentRef.length > 200) {
    throw new Error("ipay_invalid_response");
  }

  let paymentUrl: URL;
  try {
    paymentUrl = new URL(record.payment_url);
  } catch {
    throw new Error("ipay_invalid_payment_url");
  }

  const allowedHost =
    paymentUrl.hostname === "ipay.tn" || paymentUrl.hostname.endsWith(".ipay.tn");
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
    headers: {
      "X-Org-Id": cfg.orgId,
      Authorization: `Bearer ${cfg.jwt}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      product_code: cfg.productCode,
      amount: ipayAmountFromMillimes(input.amountMillimes, cfg.amountUnit),
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
  return parseIpayOneShotResponse(payload);
}
