import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ipayAmountFromMillimes,
  isIpayCheckoutEnabled,
  ipayCreateOneShot,
  ipayGetWebhookHealth,
  ipayInitClaimError,
  parseIpayOneShotResponse,
} from "./ipay.server";

describe("iPay checkout kill switch", () => {
  it("requires both the admin switch and the independent environment gate", () => {
    expect(isIpayCheckoutEnabled(false, "true")).toBe(false);
    expect(isIpayCheckoutEnabled(true, "false")).toBe(false);
    expect(isIpayCheckoutEnabled(true, undefined)).toBe(false);
    expect(isIpayCheckoutEnabled(true, "true")).toBe(true);
  });
});

describe("iPay TND dinar conversion", () => {
  it("converts canonical TND millimes to dinars", () => {
    expect(ipayAmountFromMillimes(12500)).toBe(12.5);
    expect(ipayAmountFromMillimes(10500)).toBe(10.5);
  });

  it("rejects zero, negative, fractional, and unsafe amounts", () => {
    expect(() => ipayAmountFromMillimes(0)).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(-1)).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(1.5)).toThrow("invalid_order_amount");
    expect(() => ipayAmountFromMillimes(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      "invalid_order_amount",
    );
  });
});

describe("iPay one-shot response validation", () => {
  it("accepts a hosted HTTPS checkout URL on an iPay domain", () => {
    expect(
      parseIpayOneShotResponse({
        id: "txn-123",
        payment_url: "https://checkout.ipay.tn/pay/txn-123",
        amount: 10.5,
        currency: "TND",
        invoice_reference: "order-123",
      }),
    ).toEqual({
      paymentRef: "txn-123",
      paymentUrl: "https://checkout.ipay.tn/pay/txn-123",
    });
  });

  it("matches decimal TND strings to the canonical millime total", () => {
    const response = {
      id: "txn-amount",
      payment_url: "https://checkout.ipay.tn/pay/txn-amount",
      amount: "12.500",
      currency: "TND",
      invoice_reference: "order-amount",
    };
    expect(
      parseIpayOneShotResponse(response, {
        amountMillimes: 12500,
        orderId: "order-amount",
      }).paymentRef,
    ).toBe("txn-amount");

    expect(() =>
      parseIpayOneShotResponse(
        { ...response, amount: "12.5000" },
        { amountMillimes: 12500, orderId: "order-amount" },
      ),
    ).toThrow("ipay_invalid_response");
  });

  it("rejects a provider response that does not match the requested amount, currency, or order", () => {
    const response = {
      id: "txn-123",
      payment_url: "https://ipay.tn/pay/txn-123",
      amount: 10.5,
      currency: "TND",
      invoice_reference: "order-123",
    };
    expect(() =>
      parseIpayOneShotResponse(
        { ...response, amount: 10.499 },
        {
          amountMillimes: 10500,
          orderId: "order-123",
        },
      ),
    ).toThrow("ipay_response_amount_mismatch");
    expect(() =>
      parseIpayOneShotResponse(
        { ...response, currency: "EUR" },
        {
          amountMillimes: 10500,
          orderId: "order-123",
        },
      ),
    ).toThrow("ipay_response_currency_mismatch");
    expect(() =>
      parseIpayOneShotResponse(
        { ...response, invoice_reference: "another-order" },
        {
          amountMillimes: 10500,
          orderId: "order-123",
        },
      ),
    ).toThrow("ipay_response_invoice_mismatch");
  });

  it("rejects non-iPay hosts, credentials, and non-HTTPS URLs", () => {
    for (const payment_url of [
      "https://ipay.tn.attacker.example/pay",
      "https://user@ipay.tn/pay",
      "http://ipay.tn/pay",
    ]) {
      expect(() =>
        parseIpayOneShotResponse({
          id: "txn-123",
          payment_url,
          amount: 10.5,
          currency: "TND",
          invoice_reference: "order-123",
        }),
      ).toThrow("ipay_invalid_payment_url");
    }
  });

  it("rejects missing or empty transaction references", () => {
    expect(() => parseIpayOneShotResponse({ payment_url: "https://ipay.tn/pay" })).toThrow(
      "ipay_invalid_response",
    );
    expect(() =>
      parseIpayOneShotResponse({ id: "  ", payment_url: "https://ipay.tn/pay" }),
    ).toThrow("ipay_invalid_response");
  });
});

describe("iPay one-shot response hardening", () => {
  it("accepts a numeric provider transaction id and normalizes it to a string", () => {
    expect(
      parseIpayOneShotResponse({
        id: 987654,
        payment_url: "https://ipay.tn/checkout/987654",
        amount: 10.5,
        currency: "TND",
        invoice_reference: "order-123",
      }),
    ).toEqual({
      paymentRef: "987654",
      paymentUrl: "https://ipay.tn/checkout/987654",
    });
  });

  it("rejects malformed payloads and non-string checkout URLs", () => {
    for (const payload of [
      null,
      undefined,
      "not-an-object",
      {},
      { id: "txn-1", payment_url: 123 },
      { id: {}, payment_url: "https://ipay.tn/pay" },
    ]) {
      expect(() => parseIpayOneShotResponse(payload)).toThrow("ipay_invalid_response");
    }
  });

  it("rejects lookalike hosts and non-standard ports", () => {
    for (const payment_url of [
      "https://notipay.tn/pay",
      "https://ipay.tn.attacker.example/pay",
      "https://checkout.ipay.tn:444/pay",
      "https://checkout.ipay.tn:443/pay",
    ]) {
      const expected =
        payment_url === "https://checkout.ipay.tn:443/pay"
          ? "https://checkout.ipay.tn/pay"
          : undefined;
      if (expected) {
        expect(
          parseIpayOneShotResponse({
            id: "txn-1",
            payment_url,
            amount: 10.5,
            currency: "TND",
            invoice_reference: "order-123",
          }).paymentUrl,
        ).toBe(expected);
      } else {
        expect(() =>
          parseIpayOneShotResponse({
            id: "txn-1",
            payment_url,
            amount: 10.5,
            currency: "TND",
            invoice_reference: "order-123",
          }),
        ).toThrow("ipay_invalid_payment_url");
      }
    }
  });

  it("rejects oversized transaction references", () => {
    expect(() =>
      parseIpayOneShotResponse({
        id: "x".repeat(201),
        payment_url: "https://ipay.tn/pay",
        amount: 10.5,
        currency: "TND",
        invoice_reference: "order-123",
      }),
    ).toThrow("ipay_invalid_response");
  });
});

describe("iPay read-only webhook health check", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("calls only the documented GET health endpoint and optionally probes URLs", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ overall_healthy: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ipayGetWebhookHealth(true)).resolves.toEqual({ overall_healthy: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe("https://api.ipay.tn/api/admin/webhooks/health?probe=true");
    expect(init.method).toBe("GET");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
    expect((init.headers as Record<string, string>)["X-Org-Id"]).toBe("org-test");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer jwt-test");
  });

  it("fails closed when credentials are not configured", async () => {
    await expect(ipayGetWebhookHealth()).rejects.toThrow("ipay_not_configured");
  });

  it("does not treat provider errors as a healthy integration", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 })));

    await expect(ipayGetWebhookHealth()).rejects.toThrow("ipay_health_check_failed");
  });
});

describe("iPay one-shot request safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends a dinar amount in a bounded POST request without an amount-unit setting", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    vi.stubEnv("IPAY_CHECKOUT_ENABLED", "true");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "txn-test",
          payment_url: "https://checkout.ipay.tn/pay/txn-test",
          amount: 10.5,
          currency: "TND",
          invoice_reference: "order-test",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ipayCreateOneShot({
        amountMillimes: 10500,
        orderId: "order-test",
        customerName: "Test Buyer",
      }),
    ).resolves.toEqual({
      paymentRef: "txn-test",
      paymentUrl: "https://checkout.ipay.tn/pay/txn-test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe("https://api.ipay.tn/api/admin/transactions/create-oneshot");
    expect(init.method).toBe("POST");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const payload = JSON.parse(String(init.body)) as {
      amount: number;
      currency: string;
    };
    expect(payload.amount).toBe(10.5);
    expect(payload.currency).toBe("TND");
  });
});

describe("iPay invalid input guards", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects blank order references and customer names before contacting iPay", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    vi.stubEnv("IPAY_CHECKOUT_ENABLED", "true");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ipayCreateOneShot({
        amountMillimes: 10500,
        orderId: "   ",
        customerName: "Test Buyer",
      }),
    ).rejects.toThrow("invalid_order_reference");

    await expect(
      ipayCreateOneShot({
        amountMillimes: 10500,
        orderId: "order-test",
        customerName: "   ",
      }),
    ).rejects.toThrow("invalid_customer_name");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("iPay initialization claim outcomes", () => {
  it("keeps conflict and uncertain states distinct so callers cannot auto-retry", () => {
    expect(ipayInitClaimError("not_found")).toBe("order_not_found");
    expect(ipayInitClaimError("order_closed")).toBe("order_closed");
    expect(ipayInitClaimError("provider_conflict")).toBe("provider_conflict");
    expect(ipayInitClaimError("in_progress")).toBe("payment_initialization_in_progress");
    expect(ipayInitClaimError("unexpected")).toBe("payment_initialization_uncertain");
  });
});
