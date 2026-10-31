// Pure download orchestration: reserve -> sign -> finalize. No URL is returned before finalization.
export const SIGNED_URL_SECONDS = 300;

export interface Reservation {
  outcome: string;
  reservation_id: string | null;
  storage_path: string | null;
  file_name: string | null;
}

export interface DownloadDeps {
  reserve: () => Promise<Reservation | null>;
  sign: (path: string, seconds: number, fileName: string) => Promise<string | null>;
  finalize: (reservationId: string) => Promise<boolean>;
  release: (reservationId: string) => Promise<void>;
}

export type DownloadResult =
  { ok: true; url: string; counted: boolean } | { ok: false; error: string };

export async function issueDownload(deps: DownloadDeps): Promise<DownloadResult> {
  const r = await deps.reserve();
  if (!r) return { ok: false, error: "download_failed" };
  if (r.outcome !== "new" && r.outcome !== "dedupe") return { ok: false, error: r.outcome };
  if (!r.storage_path || !r.file_name || !r.reservation_id)
    return { ok: false, error: "download_failed" };

  let url: string | null = null;
  try {
    url = await deps.sign(r.storage_path, SIGNED_URL_SECONDS, r.file_name);
  } catch {
    url = null;
  }
  if (r.outcome === "dedupe") {
    // Repeat within the 5-minute window: fresh URL, no attempt consumed.
    return url ? { ok: true, url, counted: false } : { ok: false, error: "file_missing" };
  }
  if (!url) {
    await deps.release(r.reservation_id);
    return { ok: false, error: "file_missing" };
  }
  const finalized = await deps.finalize(r.reservation_id);
  if (!finalized) return { ok: false, error: "download_failed" };
  return { ok: true, url, counted: true };
}
