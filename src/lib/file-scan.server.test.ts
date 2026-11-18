import { describe, expect, it, vi } from "vitest";
import { scanUploadedFile } from "./file-scan.server";

const input = {
  fileUrl: "https://storage.example/signed-file",
  fileName: "guide.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1234,
};

const env = {
  FILE_SCAN_API_URL: "https://scanner.example/api/scan",
  FILE_SCAN_API_TOKEN: "scanner-secret",
};

describe("file malware scan gate", () => {
  it("fails closed when scanner configuration is missing", async () => {
    await expect(scanUploadedFile(input, {}, vi.fn() as unknown as typeof fetch)).rejects.toThrow(
      "file_scan_unavailable",
    );
  });

  it("rejects non-HTTPS scanner endpoints", async () => {
    await expect(
      scanUploadedFile(input, {
        ...env,
        FILE_SCAN_API_URL: "http://scanner.example/scan",
      }),
    ).rejects.toThrow("file_scan_configuration_invalid");
  });

  it("sends the file metadata to the configured scanner and accepts only a clean verdict", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "clean" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe("clean");
    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0] as [URL, RequestInit];
    expect(url.toString()).toBe(env.FILE_SCAN_API_URL);
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer scanner-secret");
    expect(JSON.parse(String(init.body))).toMatchObject({
      contract: "algorea-file-scan-v1",
      fileName: "guide.pdf",
      sizeBytes: 1234,
    });
  });

  it("returns an infected verdict without treating it as clean", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ status: "infected" }), { status: 200 }));
    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe("infected");
  });

  it("rejects unknown, malformed, failed, and unavailable scanner responses", async () => {
    const invalid = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ status: "probably_clean" }), { status: 200 }),
      );
    await expect(scanUploadedFile(input, env, invalid)).rejects.toThrow("file_scan_invalid_result");

    const badJson = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(scanUploadedFile(input, env, badJson)).rejects.toThrow("file_scan_invalid_result");

    const failed = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
    await expect(scanUploadedFile(input, env, failed)).rejects.toThrow("file_scan_service_failed");

    const offline = vi.fn().mockRejectedValue(new Error("network"));
    await expect(scanUploadedFile(input, env, offline)).rejects.toThrow(
      "file_scan_service_unavailable",
    );
  });
});
