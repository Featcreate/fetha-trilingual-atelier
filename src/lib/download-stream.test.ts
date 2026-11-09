import { describe, expect, it, vi } from "vitest";
import { createDownloadResponse } from "./download-stream";

describe("completed download streaming", () => {
  it("finalizes only after the complete response body is read", async () => {
    const finalize = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      blob: new Blob(["digital product"]),
      fileName: "guide.pdf",
      finalize,
      release,
    });

    expect(finalize).not.toHaveBeenCalled();
    expect(await response.text()).toBe("digital product");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(response.headers.get("content-disposition")).toContain("guide.pdf");
  });

  it("releases rather than finalizing when the stream is cancelled", async () => {
    const finalize = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      blob: new Blob(["x".repeat(1024 * 32)]),
      fileName: "file.bin",
      finalize,
      release,
    });
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    expect(finalize).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("errors the response if finalization fails", async () => {
    const finalize = vi.fn(async () => false);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      blob: new Blob(["content"]),
      fileName: "file.bin",
      finalize,
      release,
    });

    await expect(response.text()).rejects.toThrow();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });
});
