import { afterEach, describe, expect, it, vi } from "vitest";
import { ipayCreateOneShot } from "./ipay.server";

describe("iPay dashboard one-shot contract", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the documented field names and decimal TND amount", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    vi.stubEnv("IPAY_CHECKOUT_ENABLED", "true");

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "transaction-test",
          payment_url: "https://checkout.ipay.tn/pay/transaction-test",
          amount: 10.5,
          currency: "TND",
          invoice_reference: "order-test",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
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
      paymentRef: "transaction-test",
      paymentUrl: "https://checkout.ipay.tn/pay/transaction-test",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string | URL, RequestInit];
    expect(String(url)).toBe("https://api.ipay.tn/api/admin/transactions/create-oneshot");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      "X-Org-Id": "org-test",
      Authorization: "Bearer jwt-test",
      "Content-Type": "application/json",
      Accept: "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({
      product_code: "algorea-bazaar",
      amount: 10.5,
      currency: "TND",
      customer_name: "Test Buyer",
      customer_external_id: "order-test",
      invoice_reference: "order-test",
    });
  });

  it("does not call iPay when the explicit activation gate is off", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_CODE", "algorea-bazaar");
    vi.stubEnv("IPAY_CHECKOUT_ENABLED", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      ipayCreateOneShot({
        amountMillimes: 10500,
        orderId: "order-test",
        customerName: "Test Buyer",
      }),
    ).rejects.toThrow("ipay_not_configured");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
