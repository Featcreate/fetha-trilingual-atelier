// Server-only iPay one-shot API client. Import dynamically from server handlers.
// Checkout remains disabled unless explicitly enabled. Amount units must be explicitly
// configured after confirmation from Audasoft; no unverified unit is assumed.
const IPAY_API = "https://api.ipay.tn";
const IPAY_REQUEST_TIMEOUT_MS = 15_000;

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
  const amountUnit = process.env["IPAY_AMOUNT_UNIT"];
  // Do not silently guess whether the provider expects dinars or millimes.
  if (!orgId || !jwt || !productCode) return null;
  if (amountUnit !== "major" && amountUnit !== "minor") return null;
  if (requireActivation && process.env["IPAY_CHECKOUT_ENABLED"] !== "true") {
    return null;
  }
  return { orgId, jwt, productCode, amountUnit };
}

/** Convert canonical TND millimes to the explicitly configured iPay amount unit. */
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
    typeof record.payment_url !== "string" ||
    record.payment_url.length > 2048
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

  let response: Response;
  try {
    response = await fetch(`${IPAY_API}/api/admin/transactions/create-oneshot`, {
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
      signal: AbortSignal.timeout(IPAY_REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("ipay_provider_timeout");
    }
    throw new Error("ipay_network_error");
  }

  if (!response.ok) {
    // Never log provider response bodies or request headers; they may contain sensitive data.
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
