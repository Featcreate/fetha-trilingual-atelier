export interface StreamDownloadDeps {
  blob: Blob;
  fileName: string;
  finalize: () => Promise<boolean>;
  release: () => Promise<void>;
}

const DOWNLOAD_CHUNK_BYTES = 64 * 1024;

/**
 * Emit a reserved Blob in bounded chunks and finalize only after every byte has
 * been enqueued and the consumer requests the terminal EOF. Cancellation or
 * read/finalization failure releases the reservation so the buyer can retry.
 */
export function createDownloadResponse(deps: StreamDownloadDeps): Response {
  let offset = 0;
  let settled = false;
  let sourceBytes: ArrayBuffer | null = null;

  const releaseOnce = async () => {
    if (settled) return;
    settled = true;
    sourceBytes = null;
    await deps.release().catch(() => undefined);
  };

  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (sourceBytes === null) sourceBytes = await deps.blob.arrayBuffer();

        if (offset < sourceBytes.byteLength) {
          const end = Math.min(offset + DOWNLOAD_CHUNK_BYTES, sourceBytes.byteLength);
          controller.enqueue(new Uint8Array(sourceBytes, offset, end - offset));
          offset = end;
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
        sourceBytes = null;
        controller.close();
      } catch {
        await releaseOnce();
        controller.error(new Error("download_stream_failed"));
      }
    },
    async cancel() {
      await releaseOnce();
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
