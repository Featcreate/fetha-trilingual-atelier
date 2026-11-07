// Server-only iPay one-shot API client. Import dynamically from server handlers.
// Checkout remains disabled unless explicitly enabled and the amount unit is configured.
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
  const amountUnit = process.env["IPAY_AMOUNT_UNIT"];
  if (!orgId || !jwt || !productCode) return null;
  if (amountUnit !== "major" && amountUnit !== "minor") return null;
  if (requireActivation && process.env["IPAY_CHECKOUT_ENABLED"] !== "true") return null;
  return { orgId, jwt, productCode, amountUnit };
}

/** Convert canonical TND millimes only according to an explicitly configured provider contract. */
export function ipayAmountFromMillimes(amountMillimes: number, unit: IpayConfig["amountUnit"]): number {
  if (!Number.isSafeInteger(amountMillimes) || amountMillimes <= 0) {
    throw new Error("invalid_order_amount");
  }
  return unit === "minor" ? amountMillimes : amountMillimes / 1000;
}

export async function ipayCreateOneShot(input: {
  amountMillimes: number;
  orderId: string;
  customerName: string;
}): Promise<{ paymentUrl: string; paymentRef: string }> {
  const cfg = ipayConfig(true);
  if (!cfg) throw new Error("ipay_not_configured");

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
      customer_name: input.customerName.slice(0, 160),
      customer_external_id: input.orderId,
      invoice_reference: input.orderId,
    }),
  });

  if (!response.ok) {
    // Never log response bodies: provider errors may contain personal or sensitive data.
    console.error("iPay create-oneshot failed", response.status);
    throw new Error("ipay_provider_error");
  }

  const payload = (await response.json()) as {
    id?: string | number;
    payment_url?: string;
  };
  if (
    (typeof payload.id !== "string" && typeof payload.id !== "number") ||
    typeof payload.payment_url !== "string"
  ) {
    throw new Error("ipay_invalid_response");
  }
  const paymentUrl = new URL(payload.payment_url);
  if (paymentUrl.protocol !== "https:" || paymentUrl.hostname !== "ipay.tn" && !paymentUrl.hostname.endsWith(".ipay.tn")) {
    throw new Error("ipay_invalid_payment_url");
  }
  return { paymentUrl: paymentUrl.toString(), paymentRef: String(payload.id) };
}
