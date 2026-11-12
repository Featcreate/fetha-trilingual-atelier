import { describe, expect, it } from "vitest";
import { MAX_PRODUCT_FILE_BYTES, RESUMABLE_UPLOAD_THRESHOLD_BYTES } from "./storage-upload";

describe("digital product upload limits", () => {
  it("matches the 1 GiB per-file platform limit", () => {
    expect(MAX_PRODUCT_FILE_BYTES).toBe(1024 * 1024 * 1024);
  });

  it("uses resumable uploads above the 6 MiB standard-upload threshold", () => {
    expect(RESUMABLE_UPLOAD_THRESHOLD_BYTES).toBe(6 * 1024 * 1024);
    expect(MAX_PRODUCT_FILE_BYTES).toBeGreaterThan(RESUMABLE_UPLOAD_THRESHOLD_BYTES);
  });
});
