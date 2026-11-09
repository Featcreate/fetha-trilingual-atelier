import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getGmailAccessToken, sendPurchaseAccessEmail } from "./gmail.server";

describe("Gmail purchase email delivery", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", "test-client-id");
    vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
    vi.stubEnv("GOOGLE_OAUTH_REFRESH_TOKEN", "test-refresh-token");
    vi.stubEnv("GMAIL_SENDER_EMAIL", "contact.algoreabazaar@gmail.com");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("refreshes an access token using the configured OAuth credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ access_token: "test-access-token" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(getGmailAccessToken()).resolves.toBe("test-access-token");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = new URLSearchParams(init.body as URLSearchParams);
    expect(body.get("client_id")).toBe("test-client-id");
    expect(body.get("client_secret")).toBe("test-client-secret");
    expect(body.get("refresh_token")).toBe("test-refresh-token");
    expect(body.get("grant_type")).toBe("refresh_token");
  });

  it("fails closed when Google rejects the refresh token", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("invalid_grant", { status: 400 })));

    await expect(getGmailAccessToken()).rejects.toThrow("gmail_auth_unavailable");
  });

  it("sends a multipart purchase email with only the buyer orders link", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await sendPurchaseAccessEmail(
      "test-access-token",
      "buyer@example.com",
      "https://algorea-bazaar.onrender.com",
    );

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(init.method).toBe("POST");
    const payload = JSON.parse(String(init.body)) as { raw: string };
    const mime = Buffer.from(payload.raw, "base64url").toString("utf8");
    expect(mime).toContain("From: Algorea Bazaar <contact.algoreabazaar@gmail.com>");
    expect(mime).toContain("To: buyer@example.com");
    expect(mime).toContain("https://algorea-bazaar.onrender.com/orders");
    expect(mime).not.toContain("storage/v1/object/sign");
    expect(mime).toContain("multipart/alternative");
  });

  it("rejects non-HTTPS application URLs before calling Gmail", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendPurchaseAccessEmail("test-access-token", "buyer@example.com", "http://localhost:3000"),
    ).rejects.toThrow("app_base_url_must_be_https");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a sender address that differs from the approved account", async () => {
    vi.stubEnv("GMAIL_SENDER_EMAIL", "other@example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendPurchaseAccessEmail("test-access-token", "buyer@example.com", "https://algorea-bazaar.onrender.com"),
    ).rejects.toThrow("gmail_sender_mismatch");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
