import { describe, expect, it } from "vitest";
import {
  computeFileSha256,
  MAX_PRODUCT_FILE_BYTES,
  RESUMABLE_UPLOAD_THRESHOLD_BYTES,
} from "./storage-upload";

describe("digital product upload limits", () => {
  it("matches the 50 MiB free-plan per-file limit", () => {
    expect(MAX_PRODUCT_FILE_BYTES).toBe(50 * 1000 * 1000);
  });

  it("computes a SHA-256 digest for the exact file bytes", async () => {
    const file = new Blob(["abc"]);
    await expect(computeFileSha256(file)).resolves.toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("uses resumable uploads above the 6 MiB standard-upload threshold", () => {
    expect(RESUMABLE_UPLOAD_THRESHOLD_BYTES).toBe(6 * 1024 * 1024);
    expect(MAX_PRODUCT_FILE_BYTES).toBeGreaterThan(RESUMABLE_UPLOAD_THRESHOLD_BYTES);
  });
});
