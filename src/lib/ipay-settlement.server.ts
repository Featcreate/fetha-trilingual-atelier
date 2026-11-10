// Server-only iPay transaction verification and settlement.
const IPAY_API = "https://api.ipay.tn";
const IPAY_REQUEST_TIMEOUT_MS = 15_000;

type IpayTransaction = {
  id: string;
  invoice_reference: string;
  amount: string;
  currency: string;
  status: string;
};

type IpayWebhookNotice = {
  id?: unknown;
  invoice_reference?: unknown;
  status?: unknown;
};

export function ipayAmountToMillimes(value: unknown): number {
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,3})?$/.test(value.trim())) {
    throw new Error("ipay_invalid_amount");
  }
  const [whole, fraction = ""] = value.trim().split(".");
  const millimes = Number(whole) * 1000 + Number(fraction.padEnd(3, "0"));
  if (!Number.isSafeInteger(millimes) || millimes <= 0) {
    throw new Error("ipay_invalid_amount");
  }
  return millimes;
}

function parseIpayTransaction(payload: unknown): IpayTransaction {
  if (!payload || typeof payload !== "object") throw new Error("ipay_invalid_response");
  const envelope = payload as { success?: unknown; data?: unknown };
  if (envelope.success !== true || !envelope.data || typeof envelope.data !== "object") {
    throw new Error("ipay_transaction_not_found");
  }
  const data = envelope.data as Record<string, unknown>;
  if (
    (typeof data["id"] !== "string" && typeof data["id"] !== "number") ||
    typeof data["invoice_reference"] !== "string" ||
    typeof data["amount"] !== "string" ||
    typeof data["currency"] !== "string" ||
    typeof data["status"] !== "string"
  ) {
    throw new Error("ipay_invalid_response");
  }
  const id = String(data["id"]).trim();
  const invoiceReference = data["invoice_reference"].trim();
  if (!id || !invoiceReference || id.length > 200 || invoiceReference.length > 200) {
    throw new Error("ipay_invalid_response");
  }
  // Validate the amount here so malformed provider data never reaches the database.
  ipayAmountToMillimes(data["amount"]);
  return {
    id,
    invoice_reference: invoiceReference,
    amount: data["amount"],
    currency: data["currency"].toUpperCase(),
    status: data["status"].toLowerCase(),
  };
}

function ipayAuthHeaders(): HeadersInit {
  const orgId = process.env["IPAY_ORG_ID"];
  const jwt = process.env["IPAY_JWT"];
  if (!orgId || !jwt) throw new Error("ipay_not_configured");
  return {
    "X-Org-Id": orgId,
    Authorization: `Bearer ${jwt}`,
    Accept: "application/json",
  };
}

async function fetchIpayTransaction(path: string): Promise<IpayTransaction> {
  const response = await fetch(new URL(path, IPAY_API), {
    method: "GET",
    signal: AbortSignal.timeout(IPAY_REQUEST_TIMEOUT_MS),
    headers: ipayAuthHeaders(),
  });
  if (!response.ok) {
    console.error("iPay transaction verification failed", response.status);
    throw new Error("ipay_verification_unavailable");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("ipay_invalid_response");
  }
  return parseIpayTransaction(payload);
}

export async function ipayGetTransaction(input: {
  transactionId?: string | undefined;
  invoiceReference?: string | undefined;
}): Promise<IpayTransaction> {
  if (input.transactionId) {
    return fetchIpayTransaction(
      `/api/admin/transactions/${encodeURIComponent(input.transactionId)}`,
    );
  }
  if (input.invoiceReference) {
    const query = new URLSearchParams({ invoice_reference: input.invoiceReference });
    const response = await fetch(new URL(`/api/admin/transactions?${query.toString()}`, IPAY_API), {
      method: "GET",
      signal: AbortSignal.timeout(IPAY_REQUEST_TIMEOUT_MS),
      headers: ipayAuthHeaders(),
    });
    if (!response.ok) {
      console.error("iPay invoice lookup failed", response.status);
      throw new Error("ipay_verification_unavailable");
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("ipay_invalid_response");
    }
    if (!payload || typeof payload !== "object") throw new Error("ipay_invalid_response");
    const envelope = payload as { success?: unknown; data?: unknown };
    if (Array.isArray(envelope.data)) {
      if (envelope.data.length !== 1) throw new Error("ipay_ambiguous_invoice_reference");
      return parseIpayTransaction({ success: envelope.success, data: envelope.data[0] });
    }
    return parseIpayTransaction(payload);
  }
  throw new Error("ipay_missing_lookup_reference");
}

/**
 * Webhook is only a trigger. All settlement fields come from a fresh server-to-server GET.
 * The database RPC performs the final atomic/idempotent settlement.
 */
export async function processIpaySettlementNotice(
  notice: IpayWebhookNotice,
  source: "webhook" | "polling" | "admin_check",
): Promise<{ outcome: string }> {
  const transactionId =
    typeof notice.id === "string" || typeof notice.id === "number" ? String(notice.id).trim() : "";
  const invoiceReference =
    typeof notice.invoice_reference === "string" ? notice.invoice_reference.trim() : "";
  if (!transactionId && !invoiceReference) throw new Error("ipay_missing_lookup_reference");

  const transaction = await ipayGetTransaction({
    transactionId: transactionId || undefined,
    invoiceReference: transactionId ? undefined : invoiceReference,
  });
  if (transactionId && transaction.id !== transactionId) {
    throw new Error("ipay_transaction_id_mismatch");
  }
  if (invoiceReference && transaction.invoice_reference !== invoiceReference) {
    throw new Error("ipay_invoice_reference_mismatch");
  }
  if (transaction.status !== "completed") {
    return {
      outcome:
        transaction.status === "declared" || transaction.status === "pending"
          ? "pending"
          : "not_completed",
    };
  }
  if (transaction.currency !== "TND") throw new Error("ipay_currency_mismatch");

  const amountMillimes = ipayAmountToMillimes(transaction.amount);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, total_millimes, ipay_payment_ref")
    .eq("id", transaction.invoice_reference)
    .maybeSingle();
  if (orderError) throw new Error("ipay_order_lookup_failed");
  if (!order) throw new Error("ipay_order_not_found");
  if (order.ipay_payment_ref !== transaction.id) {
    throw new Error("ipay_order_transaction_mismatch");
  }
  if (order.total_millimes !== amountMillimes) throw new Error("ipay_amount_mismatch");

  const { data, error } = await supabaseAdmin.rpc("settle_ipay_verified_payment", {
    _order_id: order.id,
    _provider_transaction_id: transaction.id,
    _invoice_reference: transaction.invoice_reference,
    _amount_millimes: amountMillimes,
    _currency: transaction.currency,
    _provider_status: transaction.status,
    _source: source,
  });
  if (error) {
    console.error("iPay atomic settlement rejected", error.message);
    throw new Error("ipay_settlement_rejected");
  }
  return { outcome: String(data) };
}
