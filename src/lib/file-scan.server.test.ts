import { describe, expect, it, vi } from "vitest";
import { scanUploadedFile } from "./file-scan.server";

const input = {
  fileUrl: "https://storage.example/file",
  fileName: "guide.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1234,
};

const env = {
  FILE_SCAN_API_URL: "https://scanner.example/scan",
  FILE_SCAN_API_TOKEN: "test-token",
};

describe("file malware scan gate", () => {
  it("fails closed when scanner settings are missing", async () => {
    await expect(scanUploadedFile(input, {})).rejects.toThrow(
      "file_scan_unavailable",
    );
  });

  it("accepts a clean verdict", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "clean" }), { status: 200 }),
    );
    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe("clean");
  });

  it("does not treat an infected verdict as clean", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ status: "infected" }), { status: 200 }),
    );
    await expect(scanUploadedFile(input, env, fetcher)).resolves.toBe("infected");
  });
});
