export interface StreamDownloadDeps {
  source: ReadableStream<Uint8Array>;
  fileName: string;
  contentType?: string;
  contentLength?: string | null;
  finalize: () => Promise<boolean>;
  release: () => Promise<void>;
}

/**
 * Proxy the private storage response with backpressure. A reservation is
 * consumed only after the upstream body reaches EOF and finalization succeeds.
 * Cancellation and upstream/finalization errors release the reservation.
 */
export function createDownloadResponse(deps: StreamDownloadDeps): Response {
  const reader = deps.source.getReader();
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
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        await releaseOnce();
      }
    },
  }, { highWaterMark: 0 });

  const safeName = deps.fileName.replace(/[\r\n"]/g, "_");
  const headers = new Headers({
    "Content-Type": deps.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(deps.fileName)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "none",
  });
  if (deps.contentLength && /^\d+$/.test(deps.contentLength)) {
    headers.set("Content-Length", deps.contentLength);
  }

  return new Response(body, { status: 200, headers });
}
