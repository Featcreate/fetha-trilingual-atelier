import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ipayAmountToMillimes,
  ipayGetTransaction,
  processIpaySettlementNotice,
} from "./ipay-settlement.server";

describe("iPay exact TND amount parsing", () => {
  it("converts decimal strings to integer millimes without floating point", () => {
    expect(ipayAmountToMillimes("45.000")).toBe(45000);
    expect(ipayAmountToMillimes("12.5")).toBe(12500);
    expect(ipayAmountToMillimes("0.001")).toBe(1);
    expect(ipayAmountToMillimes(12.5)).toBe(12500);
    expect(ipayAmountToMillimes(45)).toBe(45000);
  });

  it("rejects malformed values, excess precision and unsafe amounts", () => {
    for (const value of ["1e2", "1.0001", "-1.000", "0.000", "abc", Number.NaN, Infinity]) {
      expect(() => ipayAmountToMillimes(value)).toThrow("ipay_invalid_amount");
    }
  });
});

describe("iPay authoritative transaction lookup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses transaction id lookup with Bearer and organization headers", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "tx-1",
            invoice_reference: "order-1",
            amount: "45.000",
            currency: "TND",
            status: "completed",
            product_id: "39868232-79af-499c-b8c1-71bfe43e7ccc",
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(ipayGetTransaction({ transactionId: "tx-1" })).resolves.toMatchObject({
      id: "tx-1",
      invoice_reference: "order-1",
      amount: "45.000",
      status: "completed",
    });
    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(String(url)).toBe("https://api.ipay.tn/api/admin/transactions/tx-1");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer jwt-test");
    expect((init.headers as Record<string, string>)["X-Org-Id"]).toBe("org-test");
  });

  it("accepts the documented numeric amount shape in a transaction lookup", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "tx-number",
              invoice_reference: "order-number",
              amount: 12.5,
              currency: " TND ",
              status: "completed",
              product_id: "39868232-79af-499c-b8c1-71bfe43e7ccc",
            },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(ipayGetTransaction({ transactionId: "tx-number" })).resolves.toMatchObject({
      amount: "12.5",
      currency: "TND",
      status: "completed",
    });
  });

  it("requires exactly one result for invoice-reference lookup", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: [
              {
                id: "tx-1",
                invoice_reference: "order-1",
                amount: "45.000",
                currency: "TND",
                status: "declared",
                product_id: "39868232-79af-499c-b8c1-71bfe43e7ccc",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(ipayGetTransaction({ invoiceReference: "order-1" })).resolves.toMatchObject({
      status: "declared",
    });
  });
});

describe("iPay settlement notice safety", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does not trust a webhook status and only uses the provider GET result", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            id: "tx-1",
            invoice_reference: "order-1",
            amount: "45.000",
            currency: "TND",
            status: "declared",
            product_id: "39868232-79af-499c-b8c1-71bfe43e7ccc",
          },
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      processIpaySettlementNotice(
        { id: "tx-1", invoice_reference: "order-1", status: "completed" },
        "webhook",
      ),
    ).resolves.toEqual({ outcome: "pending" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });


  it("rejects a transaction belonging to a different iPay product", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "tx-1",
              invoice_reference: "order-1",
              amount: "45.000",
              currency: "TND",
              status: "completed",
              product_id: "different-product-id",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(
      processIpaySettlementNotice({ id: "tx-1" }, "webhook"),
    ).rejects.toThrow("ipay_product_id_mismatch");
  });

  it("rejects transaction details without a product id", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubEnv("IPAY_PRODUCT_ID", "39868232-79af-499c-b8c1-71bfe43e7ccc");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "tx-1",
              invoice_reference: "order-1",
              amount: "45.000",
              currency: "TND",
              status: "completed",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(ipayGetTransaction({ transactionId: "tx-1" })).rejects.toThrow(
      "ipay_invalid_response",
    );
  });

  it("rejects a mismatched webhook transaction id", async () => {
    vi.stubEnv("IPAY_ORG_ID", "org-test");
    vi.stubEnv("IPAY_JWT", "jwt-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            data: {
              id: "tx-other",
              invoice_reference: "order-1",
              amount: "45.000",
              currency: "TND",
              status: "completed",
              product_id: "39868232-79af-499c-b8c1-71bfe43e7ccc",
            },
          }),
          { status: 200 },
        ),
      ),
    );
    await expect(processIpaySettlementNotice({ id: "tx-1" }, "webhook")).rejects.toThrow(
      "ipay_transaction_id_mismatch",
    );
  });
});
