import { describe, expect, it, vi } from "vitest";
import { scanUploadedFile } from "./file-scan.server";

const input = {
  fileUrl: "https://storage.example.test/signed/file",
  fileName: "sample.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

const env = {
  FILE_SCAN_API_URL: "https://scanner.example.test/scan",
  FILE_SCAN_API_TOKEN: "test-token",
};

describe("scanUploadedFile", () => {
  it("accepts only an exact clean verdict", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "clean" }), { status: 200 }),
    );

    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe(
      "clean",
    );
    expect(fetcher).toHaveBeenCalledWith(
      new URL(env.FILE_SCAN_API_URL),
      expect.objectContaining({
        method: "POST",
        redirect: "error",
        headers: expect.objectContaining({
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("returns infected only for an exact infected verdict", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "infected" }), { status: 200 }),
    );

    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe(
      "infected",
    );
  });

  it("fails closed when scanner configuration is missing", async () => {
    await expect(scanUploadedFile(input, {}, vi.fn())).rejects.toThrow(
      "file_scan_unavailable",
    );
  });

  it("rejects non-HTTPS scanner endpoints", async () => {
    await expect(
      scanUploadedFile(
        input,
        { ...env, FILE_SCAN_API_URL: "http://scanner.test/scan" },
        vi.fn(),
      ),
    ).rejects.toThrow("file_scan_configuration_invalid");
  });

  it("rejects non-HTTPS signed file URLs", async () => {
    await expect(
      scanUploadedFile(
        { ...input, fileUrl: "http://storage.test/file" },
        env,
        vi.fn(),
      ),
    ).rejects.toThrow("file_scan_source_invalid");
  });

  it("fails closed when the scanner is unavailable", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network unavailable"));

    await expect(scanUploadedFile(input, env, fetcher)).rejects.toThrow(
      "file_scan_service_unavailable",
    );
  });

  it("fails closed on non-success HTTP responses", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));

    await expect(scanUploadedFile(input, env, fetcher)).rejects.toThrow(
      "file_scan_service_failed",
    );
  });

  it("rejects oversized scanner responses", async () => {
    const oversized = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ status: "clean", extra: "x".repeat(5000) }),
        { status: 200 },
      ),
    );
    await expect(scanUploadedFile(input, env, oversized)).rejects.toThrow(
      "file_scan_invalid_result",
    );
  });

  it("fails closed on malformed JSON and unknown verdicts", async () => {
    const malformed = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(scanUploadedFile(input, env, malformed)).rejects.toThrow(
      "file_scan_invalid_result",
    );

    const unknown = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "maybe" }), { status: 200 }),
    );
    await expect(scanUploadedFile(input, env, unknown)).rejects.toThrow(
      "file_scan_invalid_result",
    );
  });
});
