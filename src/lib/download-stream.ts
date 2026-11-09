export interface StreamDownloadDeps {
  source: ReadableStream<Uint8Array>;
  fileName: string;
  contentType?: string;
  contentLength?: string | null;
  finalize: () => Promise<boolean>;
  release: () => Promise<void>;
}

/** Wrap one upstream file in a ZIP Store archive without buffering the file. */
export function createSingleFileZipStream(
  source: ReadableStream<Uint8Array>,
  entryName: string,
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const name = new TextEncoder().encode(entryName.replace(/[\\/\\r\\n]/g, "_"));
  if (name.byteLength === 0 || name.byteLength > 0xffff) {
    throw new Error("invalid_zip_entry_name");
  }

  const crcTable = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crcTable[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  let size = 0;
  let phase: "header" | "file" | "ending" | "done" = "header";

  const localHeader = new Uint8Array(30 + name.byteLength);
  const local = new DataView(localHeader.buffer);
  local.setUint32(0, 0x04034b50, true);
  local.setUint16(4, 20, true);
  local.setUint16(6, 0x0808, true); // UTF-8 names + data descriptor
  local.setUint16(8, 0, true); // Store, no compression
  local.setUint16(10, 0, true);
  local.setUint16(12, 0, true);
  local.setUint32(14, 0, true);
  local.setUint32(18, 0, true);
  local.setUint32(22, 0, true);
  local.setUint16(26, name.byteLength, true);
  local.setUint16(28, 0, true);
  localHeader.set(name, 30);

  const makeEnding = () => {
    const finalCrc = (crc ^ 0xffffffff) >>> 0;
    const descriptor = new Uint8Array(16);
    const dd = new DataView(descriptor.buffer);
    dd.setUint32(0, 0x08074b50, true);
    dd.setUint32(4, finalCrc, true);
    dd.setUint32(8, size, true);
    dd.setUint32(12, size, true);

    const central = new Uint8Array(46 + name.byteLength);
    const cd = new DataView(central.buffer);
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0808, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, 0, true);
    cd.setUint16(14, 0, true);
    cd.setUint32(16, finalCrc, true);
    cd.setUint32(20, size, true);
    cd.setUint32(24, size, true);
    cd.setUint16(28, name.byteLength, true);
    cd.setUint16(30, 0, true);
    cd.setUint16(32, 0, true);
    cd.setUint16(34, 0, true);
    cd.setUint16(36, 0, true);
    cd.setUint32(38, 0, true);
    cd.setUint32(42, 0, true);
    central.set(name, 46);

    const centralOffset = 30 + name.byteLength + size + descriptor.byteLength;
    const eocd = new Uint8Array(22);
    const end = new DataView(eocd.buffer);
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(4, 0, true);
    end.setUint16(6, 0, true);
    end.setUint16(8, 1, true);
    end.setUint16(10, 1, true);
    end.setUint32(12, central.byteLength, true);
    end.setUint32(16, centralOffset, true);
    end.setUint16(20, 0, true);
    return [descriptor, central, eocd];
  };

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        if (phase === "header") {
          phase = "file";
          controller.enqueue(localHeader);
          return;
        }
        if (phase === "file") {
          const next = await reader.read();
          if (!next.done) {
            size += next.value.byteLength;
            if (size > 0xffffffff) throw new Error("zip64_not_supported");
            for (const byte of next.value) {
              crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
            }
            controller.enqueue(next.value);
            return;
          }
          phase = "ending";
        }
        if (phase === "ending") {
          for (const part of makeEnding()) controller.enqueue(part);
          phase = "done";
          controller.close();
          return;
        }
        controller.close();
      } catch {
        await reader.cancel().catch(() => undefined);
        controller.error(new Error("zip_stream_failed"));
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  }, { highWaterMark: 0 });
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

  const safeName = deps.fileName.replace(/[\\r\\n"]/g, "_");
  const headers = new Headers({
    "Content-Type": deps.contentType || "application/octet-stream",
    "Content-Disposition": `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(deps.fileName)}`,
    "Cache-Control": "private, no-store, max-age=0",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "none",
  });
  if (deps.contentLength && /^\\d+$/.test(deps.contentLength)) {
    headers.set("Content-Length", deps.contentLength);
  }

  return new Response(body, { status: 200, headers });
}
