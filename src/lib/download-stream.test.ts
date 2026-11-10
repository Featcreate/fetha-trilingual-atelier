import { describe, expect, it, vi } from "vitest";
import { createDownloadResponse, createSingleFileZipStream } from "./download-stream";

function sourceFrom(text: string) {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe("completed download streaming", () => {
  it("finalizes only after the complete upstream response reaches EOF", async () => {
    const finalize = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      source: sourceFrom("digital product"),
      fileName: "guide.pdf",
      contentType: "application/pdf",
      contentLength: String("digital product".length),
      finalize,
      release,
    });

    expect(finalize).not.toHaveBeenCalled();
    expect(await response.text()).toBe("digital product");
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(response.headers.get("content-disposition")).toContain("guide.pdf");
    expect(response.headers.get("content-type")).toBe("application/pdf");
  });

  it("releases rather than finalizing when the stream is cancelled", async () => {
    const finalize = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      source: new ReadableStream<Uint8Array>({
        pull(controller) {
          controller.enqueue(new Uint8Array(32 * 1024));
        },
      }),
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

  it("errors the response and releases when finalization fails", async () => {
    const finalize = vi.fn(async () => false);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      source: sourceFrom("content"),
      fileName: "file.bin",
      finalize,
      release,
    });

    await expect(response.text()).rejects.toThrow();
    expect(finalize).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("releases when the upstream stream errors", async () => {
    const finalize = vi.fn(async () => true);
    const release = vi.fn(async () => {});
    const response = createDownloadResponse({
      source: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.error(new Error("upstream interrupted"));
        },
      }),
      fileName: "file.bin",
      finalize,
      release,
    });

    await expect(response.text()).rejects.toThrow();
    expect(finalize).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("creates a compressed ZIP archive with the original file bytes", async () => {
    const zip = createSingleFileZipStream(sourceFrom("zip payload"), "guide.txt");
    const bytes = new Uint8Array(await new Response(zip).arrayBuffer());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const centralOffset = view.getUint32(bytes.byteLength - 22 + 16, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(26, true);
    const extraLength = view.getUint16(28, true);
    const dataStart = 30 + fileNameLength + extraLength;
    const compressedBytes = bytes.slice(dataStart, dataStart + compressedSize);
    const decompressed = new Response(compressedBytes).body!.pipeThrough(
      new DecompressionStream("deflate-raw" as CompressionFormat),
    );

    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(new TextDecoder().decode(bytes.slice(0, dataStart))).toContain("guide.txt");
    expect(await new Response(decompressed).text()).toBe("zip payload");
    expect(view.getUint32(bytes.byteLength - 22, true)).toBe(0x06054b50);
  });

  it("supports Unicode filenames with an ASCII fallback header", async () => {
    const response = createDownloadResponse({
      source: sourceFrom("content"),
      fileName: "دليل.pdf",
      finalize: async () => true,
      release: async () => {},
    });

    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toContain('filename="____.pdf"');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(await response.text()).toBe("content");
  });

});
