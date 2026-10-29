import { describe, expect, it, vi } from "vitest";
import { issueDownload, type DownloadDeps, type Reservation } from "./download-flow";

function deps(res: Reservation | null, signed: string | null | Error = "https://signed", finalized = true) {
  return {
    reserve: vi.fn(async () => res),
    sign: vi.fn(async () => {
      if (signed instanceof Error) throw signed;
      return signed;
    }),
    finalize: vi.fn(async () => finalized),
    release: vi.fn(async () => {}),
  } satisfies DownloadDeps;
}
const fresh: Reservation = { outcome: "new", reservation_id: "r1", storage_path: "s/p/v/f.pdf", file_name: "f.pdf" };

describe("secure download flow", () => {
  it("signs for 300 seconds and counts only after finalization", async () => {
    const d = deps(fresh);
    expect(await issueDownload(d)).toEqual({ ok: true, url: "https://signed", counted: true });
    expect(d.sign).toHaveBeenCalledWith("s/p/v/f.pdf", 300, "f.pdf");
    expect(d.finalize).toHaveBeenCalledWith("r1");
  });
  it("releases the reservation without counting when signing fails", async () => {
    const d = deps(fresh, new Error("storage down"));
    expect(await issueDownload(d)).toEqual({ ok: false, error: "file_missing" });
    expect(d.release).toHaveBeenCalledWith("r1");
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it("never returns a URL when finalization is refused (limit reached or expired reservation)", async () => {
    const d = deps(fresh, "https://signed", false);
    expect(await issueDownload(d)).toEqual({ ok: false, error: "download_failed" });
  });
  it("repeat within 5 minutes gets a new URL without using an attempt", async () => {
    const d = deps({ ...fresh, outcome: "dedupe" });
    expect(await issueDownload(d)).toEqual({ ok: true, url: "https://signed", counted: false });
    expect(d.finalize).not.toHaveBeenCalled();
  });
  it.each(["forbidden", "not_paid", "expired", "busy", "quota_exhausted"])("refuses %s without signing", async (outcome) => {
    const d = deps({ outcome, reservation_id: null, storage_path: null, file_name: null });
    expect(await issueDownload(d)).toEqual({ ok: false, error: outcome });
    expect(d.sign).not.toHaveBeenCalled();
  });
});
