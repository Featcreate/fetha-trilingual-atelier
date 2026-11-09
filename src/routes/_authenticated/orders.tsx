import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { downloadPurchasedFile } from "@/lib/download-client";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [{ title: "Mes commandes — Algorea Bazaar" }, { name: "robots", content: "noindex" }],
  }),
  component: BuyerOrdersPage,
});

type DownloadEntitlement = {
  id: string;
  expires_at: string;
  max_downloads: number;
  used_downloads: number;
};

type BuyerOrder = {
  id: string;
  status: string;
  total_millimes: number;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    unit_price_millimes: number;
    order_item_files: Array<{
      id: string;
      file_name: string;
      download_entitlements: DownloadEntitlement | DownloadEntitlement[] | null;
      zip_download_entitlements: DownloadEntitlement | DownloadEntitlement[] | null;
    }>;
  }>;
};

function BuyerOrdersPage() {
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const query = useQuery({
    queryKey: ["buyer-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,status,total_millimes,created_at,order_items(id,product_name,unit_price_millimes,order_item_files(id,file_name,download_entitlements(id,expires_at,max_downloads,used_downloads)))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const orders = data ?? [];
      const orderIds = orders.map((order) => order.id);
      if (orderIds.length === 0) return [] as unknown as BuyerOrder[];

      const { data: zipRows, error: zipError } = await supabase
        .from("zip_download_entitlements")
        .select("id,order_item_file_id,expires_at,max_downloads,used_downloads")
        .in("order_id", orderIds);
      if (zipError) throw zipError;
      const zipByFile = new Map((zipRows ?? []).map((row) => [row.order_item_file_id, row]));

      return orders.map((order) => ({
        ...order,
        order_items: order.order_items.map((item) => ({
          ...item,
          order_item_files: item.order_item_files.map((file) => ({
            ...file,
            zip_download_entitlements: zipByFile.get(file.id) ?? null,
          })),
        })),
      })) as unknown as BuyerOrder[];
    },
  });
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";
  const originalLabel = lang === "ar" ? "تنزيل الملف الأصلي" : lang === "en" ? "Download original" : "Télécharger l’original";
  const zipLabel = lang === "ar" ? "تنزيل ZIP" : lang === "en" ? "Download ZIP" : "Télécharger ZIP";

  async function download(entitlementId: string, type: "original" | "zip") {
    const busyKey = `${type}:${entitlementId}`;
    setBusy(busyKey);
    setNotice("");
    try {
      await downloadPurchasedFile(entitlementId, type);
      await query.refetch();
    } catch {
      setNotice(m.downloadError);
    } finally {
      setBusy(null);
    }
  }

  function renderDownloadButton(entitlement: DownloadEntitlement | null, type: "original" | "zip", fileName: string) {
    if (!entitlement) return null;
    const busyKey = `${type}:${entitlement.id}`;
    const expired = entitlement.expires_at <= new Date().toISOString();
    const exhausted = entitlement.used_downloads >= entitlement.max_downloads;
    const label = type === "original" ? originalLabel : zipLabel;
    return (
      <div key={busyKey} className="text-end">
        <button
          type="button"
          disabled={busy === busyKey || expired || exhausted}
          onClick={() => download(entitlement.id, type)}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
        >
          {busy === busyKey ? m.loading : label}
        </button>
        <p className="mt-1 text-xs text-muted-foreground">
          {m.downloadsLeft}: {Math.max(0, entitlement.max_downloads - entitlement.used_downloads)}
        </p>
        <p className="text-xs text-muted-foreground">
          {type === "zip" ? "ZIP" : fileName} · {m.expires}{" "}
          {new Date(entitlement.expires_at).toLocaleDateString(locale)}
        </p>
      </div>
    );
  }

  return (
    <AuthShell lang={lang} setLang={setLang} title={m.myOrders} wide>
      <div className="mb-5 flex gap-4 text-sm">
        <Link to="/catalog" className="font-semibold text-coral hover:underline">
          {m.viewCatalog}
        </Link>
        <Link to="/seller" className="font-semibold text-coral hover:underline">
          {m.sellerArea}
        </Link>
      </div>
      {notice && (
        <p role="alert" className="mb-4 rounded-lg bg-secondary p-3 text-sm">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <p>{m.loading}</p>
      ) : query.isError ? (
        <p role="alert">{m.error}</p>
      ) : !query.data?.length ? (
        <p className="rounded-xl bg-secondary p-5">{m.noOrders}</p>
      ) : (
        <div className="space-y-4">
          {query.data.map((order) => (
            <article key={order.id} className="rounded-xl border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs text-muted-foreground">
                    #{order.id.slice(0, 8)} ·{" "}
                    {new Date(order.created_at).toLocaleDateString(locale)}
                  </p>
                  <h2 className="mt-1 font-bold">{formatTND(order.total_millimes)}</h2>
                </div>
                <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                  {m[order.status as keyof typeof m] ?? order.status}
                </span>
              </div>
              <div className="mt-4 space-y-3 border-t border-border pt-3">
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTND(item.unit_price_millimes)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.order_item_files.map((file) => {
                        const original = Array.isArray(file.download_entitlements)
                          ? file.download_entitlements[0] ?? null
                          : file.download_entitlements;
                        const zip = Array.isArray(file.zip_download_entitlements)
                          ? file.zip_download_entitlements[0] ?? null
                          : file.zip_download_entitlements;
                        return (
                          <div key={file.id} className="flex flex-wrap gap-2">
                            {renderDownloadButton(original, "original", file.file_name)}
                            {renderDownloadButton(zip, "zip", file.file_name)}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </AuthShell>
  );
}
