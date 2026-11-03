import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useLang } from "@/lib/i18n";

type Store = Database["public"]["Tables"]["stores"]["Row"];
type Kind = "logo" | "avatar" | "banner";
const fields = {
  logo: "logo_path",
  avatar: "avatar_path",
  banner: "banner_path",
} as const;
const labels = {
  logo: "storeLogo",
  avatar: "sellerAvatar",
  banner: "storeBanner",
} as const;
const maxBytes = 5 * 1024 * 1024;
const mimeTypes = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function StoreBrandingEditor({
  store,
  onSaved,
}: {
  store: Store;
  onSaved: () => Promise<unknown> | void;
}) {
  const { t } = useLang();
  const m = t.marketplace;
  const [busy, setBusy] = useState<Kind | null>(null);
  const [notice, setNotice] = useState("");

  async function upload(kind: Kind, file: File) {
    if (!mimeTypes.includes(file.type) || file.size < 1 || file.size > maxBytes) {
      setNotice(m.storeImageInvalid);
      return;
    }
    const field = fields[kind];
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1];
    const path = store.id + "/" + kind + "-" + crypto.randomUUID() + "." + ext;
    setBusy(kind);
    setNotice("");
    const { error: uploadError } = await supabase.storage.from("store-assets").upload(path, file, {
      contentType: file.type,
      upsert: false,
      cacheControl: "31536000",
    });
    if (uploadError) {
      setBusy(null);
      setNotice(m.storeImageSaveFailed);
      return;
    }
    const { error } = await supabase
      .from("stores")
      .update({ [field]: path })
      .eq("id", store.id)
      .eq("owner_id", store.owner_id);
    if (error) {
      await supabase.storage.from("store-assets").remove([path]);
      setBusy(null);
      setNotice(m.storeImageSaveFailed);
      return;
    }
    const oldPath = store[field];
    if (oldPath) await supabase.storage.from("store-assets").remove([oldPath]);
    setBusy(null);
    setNotice(m.storeImageSaved);
    await onSaved();
  }

  async function remove(kind: Kind) {
    const field = fields[kind];
    const oldPath = store[field];
    if (!oldPath) return;
    setBusy(kind);
    setNotice("");
    const { error } = await supabase
      .from("stores")
      .update({ [field]: null })
      .eq("id", store.id)
      .eq("owner_id", store.owner_id);
    if (error) {
      setBusy(null);
      setNotice(m.storeImageSaveFailed);
      return;
    }
    await supabase.storage.from("store-assets").remove([oldPath]);
    setBusy(null);
    setNotice(m.storeImageRemoved);
    await onSaved();
  }

  return (
    <div className="mt-5 border-t border-border pt-5">
      <h3 className="font-semibold">{m.storeBranding}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{m.storeImageHelp}</p>
      <div className="mt-4 grid gap-4 md:grid-cols-3">
        {(["logo", "avatar", "banner"] as Kind[]).map((kind) => {
          const path = store[fields[kind]];
          const url = path
            ? supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl
            : null;
          const label = m[labels[kind]];
          return (
            <div key={kind} className="rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium">{label}</p>
              {url ? (
                <img
                  src={url}
                  alt={label}
                  className={
                    kind === "banner"
                      ? "mb-3 h-20 w-full rounded-md object-cover"
                      : "mb-3 h-20 w-20 rounded-full object-cover"
                  }
                />
              ) : (
                <div
                  className={
                    kind === "banner"
                      ? "mb-3 flex h-20 items-center justify-center rounded-md bg-secondary text-xs"
                      : "mb-3 flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-xs"
                  }
                >
                  {m.noImage}
                </div>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                aria-label={label}
                disabled={busy !== null}
                onChange={(event) => {
                  const file = event.currentTarget.files?.[0];
                  event.currentTarget.value = "";
                  if (file) void upload(kind, file);
                }}
                className="block w-full text-xs"
              />
              {path && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void remove(kind)}
                  className="mt-2 text-xs font-semibold text-destructive underline disabled:opacity-50"
                >
                  {m.removeImage}
                </button>
              )}
              {busy === kind && <p className="mt-2 text-xs">{m.loading}</p>}
            </div>
          );
        })}
      </div>
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
    </div>
  );
}
