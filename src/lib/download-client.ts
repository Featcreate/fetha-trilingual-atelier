import { supabase } from "@/integrations/supabase/client";

/** Fetch the authenticated streaming endpoint, then hand the completed file to the browser. */
export async function downloadPurchasedFile(entitlementId: string): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token) throw new Error("not_authenticated");

  const response = await fetch(
    `/api/download?entitlementId=${encodeURIComponent(entitlementId)}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("download_failed");

  // Fetch resolves only after the complete response body has been received.
  const file = await response.blob();
  const disposition = response.headers.get("content-disposition") ?? "";
  const utf8Name = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  const quotedName = disposition.match(/filename="([^"]+)"/i)?.[1];
  const fileName = utf8Name
    ? decodeURIComponent(utf8Name)
    : quotedName
      ? quotedName
      : "algorea-download";

  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
