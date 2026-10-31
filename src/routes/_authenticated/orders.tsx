import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { getDownloadLink } from "@/lib/shop.functions";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [{ title: "Mes commandes — Algorea Bazaar" }, { name: "robots", content: "noindex" }],
  }),
  component: BuyerOrdersPage,
});

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
      download_entitlements:
        | { id: string; expires_at: string; max_downloads: number; used_downloads: number }
        | Array<{ id: string; expires_at: string; max_downloads: number; used_downloads: number }>
        | null;
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
      return (data ?? []) as unknown as BuyerOrder[];
    },
  });
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";

  async function download(entitlementId: string) {
    setBusy(entitlementId);
    setNotice("");
    try {
      const result = await getDownloadLink({ data: { entitlementId } });
      if (!result.ok) setNotice(m.downloadError);
      else window.location.assign(result.url);
    } catch {
      setNotice(m.downloadError);
    } finally {
      setBusy(null);
    }
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
                      {item.order_item_files
                        .flatMap((file) => {
                          const entitlements = Array.isArray(file.download_entitlements)
                            ? file.download_entitlements
                            : file.download_entitlements
                              ? [file.download_entitlements]
                              : [];
                          return entitlements.map((ent) => ({ file, ent }));
                        })
                        .map(({ file, ent }) => (
                          <div key={ent.id} className="text-end">
                            <button
                              type="button"
                              disabled={
                                busy === ent.id ||
                                ent.expires_at <= new Date().toISOString() ||
                                ent.used_downloads >= ent.max_downloads
                              }
                              onClick={() => download(ent.id)}
                              className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                            >
                              {busy === ent.id ? m.loading : m.download}
                            </button>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {m.downloadsLeft}:{" "}
                              {Math.max(0, ent.max_downloads - ent.used_downloads)} · {m.expires}{" "}
                              {new Date(ent.expires_at).toLocaleDateString(locale)}
                            </p>
                            <p className="text-xs text-muted-foreground">{file.file_name}</p>
                          </div>
                        ))}
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
