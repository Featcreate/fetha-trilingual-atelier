import { describe, expect, it } from "vitest";
import { KONNECT_API_BASE_URLS } from "./konnect-api";

describe("Konnect API environment endpoints", () => {
  it("uses the documented Sandbox API host", () => {
    expect(KONNECT_API_BASE_URLS.sandbox).toBe(
      "https://api.sandbox.konnect.network/api/v2",
    );
  });

  it("keeps the Production API host separate from Sandbox", () => {
    expect(KONNECT_API_BASE_URLS.live).toBe("https://api.konnect.network/api/v2");
    expect(KONNECT_API_BASE_URLS.live).not.toBe(KONNECT_API_BASE_URLS.sandbox);
  });
});
