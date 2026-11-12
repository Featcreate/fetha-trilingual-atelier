import { supabase } from "@/integrations/supabase/client";

// Keep the client-side cap aligned with the database and private bucket limits.
// Supabase's project-wide Storage setting can impose a lower effective maximum.
export const MAX_PRODUCT_FILE_BYTES = 1024 * 1024 * 1024;
export const RESUMABLE_UPLOAD_THRESHOLD_BYTES = 6 * 1024 * 1024;
const TUS_CHUNK_BYTES = 6 * 1024 * 1024;
const RETRY_DELAYS_MS = [1_000, 3_000, 5_000, 10_000];

// prettier-ignore
function request(
  method: string,
  url: string,
  headers: Record<string, string>,
  body?: Blob,
  onProgress?: (loaded: number) => void,
): Promise<XMLHttpRequest> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.timeout = 120_000;

    for (const [key, value] of Object.entries(headers)) {
      xhr.setRequestHeader(key, value);
    }

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded);
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(xhr);
      } else {
        reject(new Error(`storage_upload_http_${xhr.status}`));
      }
    };
    xhr.onerror = () => reject(new Error("storage_upload_network_error"));
    xhr.ontimeout = () => reject(new Error("storage_upload_timeout"));
    xhr.send(body ?? null);
  });
}

// prettier-ignore
function encodeMetadata(value: string) {
  const encoded = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)),
  );
  return btoa(encoded);
}

// prettier-ignore
function storageEndpoint() {
  const url = import.meta.env["VITE_SUPABASE_URL"];
  if (!url) throw new Error("supabase_url_missing");

  const parsed = new URL(url);
  const hostname = parsed.hostname.endsWith(".supabase.co")
    ? parsed.hostname.replace(".supabase.co", ".storage.supabase.co")
    : parsed.hostname;

  return `${parsed.protocol}//${hostname}/storage/v1/upload/resumable`;
}

// prettier-ignore
async function uploadResumable(
  path: string,
  file: File,
  accessToken: string,
  onProgress?: (percent: number) => void,
) {
  const apiKey = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!apiKey) throw new Error("supabase_publishable_key_missing");

  const endpoint = storageEndpoint();
  const headers = {
    apikey: apiKey,
    Authorization: `Bearer ${accessToken}`,
    "Tus-Resumable": "1.0.0",
  };
  const contentType = file.type || "application/octet-stream";
  const fileMetadata = JSON.stringify({ mimetype: contentType });
  const metadata = [
    `bucketName ${encodeMetadata("product-files")}`,
    `objectName ${encodeMetadata(path)}`,
    `contentType ${encodeMetadata(contentType)}`,
    `cacheControl ${encodeMetadata("3600")}`,
    `metadata ${encodeMetadata(fileMetadata)}`,
  ].join(",");

  const created = await request("POST", endpoint, {
    ...headers,
    "Upload-Length": String(file.size),
    "Upload-Metadata": metadata,
  });
  const location = created.getResponseHeader("Location");
  if (!location) throw new Error("storage_upload_location_missing");

  const uploadUrl = new URL(location, endpoint).toString();
  let offset = 0;
  let retries = 0;

  while (offset < file.size) {
    const chunk = file.slice(offset, Math.min(offset + TUS_CHUNK_BYTES, file.size));

    try {
      const patched = await request(
        "PATCH",
        uploadUrl,
        {
          ...headers,
          "Upload-Offset": String(offset),
          "Content-Type": "application/offset+octet-stream",
        },
        chunk,
        (loaded) => {
          const percent = Math.round(((offset + loaded) / file.size) * 100);
          onProgress?.(Math.min(100, percent));
        },
      );
      const nextOffset = Number(patched.getResponseHeader("Upload-Offset"));

      if (!Number.isFinite(nextOffset) || nextOffset <= offset) {
        throw new Error("storage_upload_invalid_offset");
      }

      offset = nextOffset;
      retries = 0;
      onProgress?.(Math.min(100, Math.round((offset / file.size) * 100)));
    } catch (error) {
      if (retries >= RETRY_DELAYS_MS.length) throw error;

      await new Promise((resolve) => {
        window.setTimeout(resolve, RETRY_DELAYS_MS[retries++]);
      });

      // Recover the server-confirmed offset after a dropped connection or lost PATCH response.
      const head = await request("HEAD", uploadUrl, headers);
      const serverOffset = Number(head.getResponseHeader("Upload-Offset"));

      if (!Number.isFinite(serverOffset) || serverOffset < offset || serverOffset > file.size) {
        throw new Error("storage_upload_resume_failed");
      }

      offset = serverOffset;
    }
  }

  onProgress?.(100);
}

// prettier-ignore
export async function uploadProductFile(
  path: string,
  file: File,
  onProgress?: (percent: number) => void,
) {
  if (file.size < 1 || file.size > MAX_PRODUCT_FILE_BYTES) {
    throw new Error("file_size_limit_exceeded");
  }

  if (file.size <= RESUMABLE_UPLOAD_THRESHOLD_BYTES) {
    const { error } = await supabase.storage.from("product-files").upload(path, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (error) throw error;

    onProgress?.(100);
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (error || !accessToken) throw new Error("storage_upload_auth_required");

  await uploadResumable(path, file, accessToken, onProgress);
}
