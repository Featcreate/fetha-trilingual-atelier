export interface StreamDownloadDeps {
  blob: Blob;
  fileName: string;
  finalize: () => Promise<boolean>;
  release: () => Promise<void>;
}

/**
 * Stream a reserved file and finalize only after the server-side Blob stream is exhausted.
 * Cancelling or failing the stream releases the reservation so the buyer can retry.
 */
export function createDownloadResponse(deps: StreamDownloadDeps): Response {
  const reader = deps.blob.stream().getReader();
  let settled = false;

  const releaseOnce = async () => {
    if (settled) return;
    settled = true;
    await deps.release().catch(() => undefined);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (!done) {
          controller.enqueue(value);
          return;
        }
        if (settled) return;

        const finalized = await deps.finalize();
        if (!finalized) {
          await releaseOnce();
          controller.error(new Error("download_finalize_failed"));
          return;
        }
        settled = true;
        controller.close();
      } catch {
        await releaseOnce();
        controller.error(new Error("download_stream_failed"));
      }
    },
    async cancel() {
      try {
        await reader.cancel();
      } finally {
        await releaseOnce();
      }
    },
  }, { highWaterMark: 0 });

  const safeName = deps.fileName.replace(/[\r\n"]/g, "_");
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": deps.blob.type || "application/octet-stream",
      "Content-Length": String(deps.blob.size),
      "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(deps.fileName)}`,
      "Cache-Control": "private, no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      "Accept-Ranges": "none",
    },
  });
}
