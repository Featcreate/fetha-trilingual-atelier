import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Star } from "lucide-react";
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

type BuyerOrder = {
  id: string;
  status: string;
  total_millimes: number;
  created_at: string;
  order_items: Array<{
    id: string;
    product_name: string;
    unit_price_millimes: number;
    store_id: string | null;
    stores: { name: string } | null;
    order_item_files: Array<{
      id: string;
      file_name: string;
      download_entitlements:
        | { id: string; expires_at: string; max_downloads: number; used_downloads: number }
        | Array<{ id: string; expires_at: string; max_downloads: number; used_downloads: number }>
        | null;
      zip_download_entitlements:
        | { id: string; expires_at: string; max_downloads: number; used_downloads: number }
        | Array<{ id: string; expires_at: string; max_downloads: number; used_downloads: number }>
        | null;
    }>;
  }>;
};

type ZipEntitlementRow = {
  id: string;
  order_item_file_id: string;
  expires_at: string;
  max_downloads: number;
  used_downloads: number;
};

type RawBuyerOrder = {
  [key: string]: unknown;
  id: string;
  order_items: Array<{
    [key: string]: unknown;
    order_item_files: Array<{ [key: string]: unknown; id: string }>;
  }>;
};

type ZipEntitlementQueryClient = {
  from: (table: "zip_download_entitlements") => {
    select: (columns: string) => {
      in: (
        column: "order_id",
        values: string[],
      ) => Promise<{ data: ZipEntitlementRow[] | null; error: { message: string } | null }>;
    };
  };
};

function BuyerOrdersPage() {
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const [ratingBusy, setRatingBusy] = useState<string | null>(null);
  const qc = useQueryClient();
  const ratingsQuery = useQuery({
    queryKey: ["buyer-seller-ratings"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_my_seller_ratings");
      if (error) throw error;
      return data ?? [];
    },
  });
  const query = useQuery({
    queryKey: ["buyer-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id,status,total_millimes,created_at,order_items(id,product_name,unit_price_millimes,store_id,stores(name),order_item_files(id,file_name,download_entitlements(id,expires_at,max_downloads,used_downloads)))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      const orders = (data ?? []) as unknown as RawBuyerOrder[];
      const orderIds = orders.map((order) => order.id);
      if (!orderIds.length) return [] as unknown as BuyerOrder[];
      const zipClient = supabase as unknown as ZipEntitlementQueryClient;
      const { data: zipRows, error: zipError } = await zipClient
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

  async function rateSeller(storeId: string, stars: number) {
    setRatingBusy(storeId);
    setNotice("");
    const { error } = await supabase.rpc("submit_seller_rating", {
      _store_id: storeId,
      _stars: stars,
    });
    setRatingBusy(null);
    if (error) {
      setNotice(
        error.message.includes("verified_purchase_required") ? m.verifiedPurchaseRating : m.error,
      );
      return;
    }
    setNotice(m.ratingSaved);
    await qc.invalidateQueries({ queryKey: ["buyer-seller-ratings"] });
    await qc.invalidateQueries({ queryKey: ["homepage-top-rated-stores"] });
  }

  async function download(entitlementId: string, type: "original" | "zip") {
    const key = `${type}:${entitlementId}`;
    setBusy(key);
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
                {Array.from(
                  new Map(
                    order.order_items
                      .filter((item) => item.store_id)
                      .map((item) => [
                        item.store_id!,
                        { storeId: item.store_id!, storeName: item.stores?.name ?? m.store },
                      ]),
                  ).values(),
                ).map((store) => {
                  const currentStars =
                    ratingsQuery.data?.find((rating) => rating.store_id === store.storeId)?.stars ??
                    0;
                  return (
                    <div
                      key={store.storeId}
                      className="rounded-xl border border-border bg-cream-light p-3"
                    >
                      <p className="text-sm font-semibold">
                        {m.rateSeller}: {store.storeName}
                      </p>
                      <div className="mt-2 flex items-center gap-1" dir="ltr">
                        {Array.from({ length: 5 }, (_, index) => {
                          const stars = index + 1;
                          return (
                            <button
                              key={stars}
                              type="button"
                              disabled={ratingBusy === store.storeId}
                              onClick={() => rateSeller(store.storeId, stars)}
                              aria-label={stars + " / 5"}
                              aria-pressed={currentStars === stars}
                              className="rounded p-1 text-amber-500 transition hover:scale-110 disabled:opacity-50"
                            >
                              <Star
                                className="h-6 w-6"
                                fill={stars <= currentStars ? "currentColor" : "none"}
                              />
                            </button>
                          );
                        })}
                        {currentStars > 0 && (
                          <span className="ms-2 text-xs text-muted-foreground">
                            {m.updateRating}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {order.order_items.map((item) => (
                  <div key={item.id} className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{item.product_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTND(item.unit_price_millimes)}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.order_item_files.flatMap((file) => {
                        const originals = Array.isArray(file.download_entitlements)
                          ? file.download_entitlements
                          : file.download_entitlements
                            ? [file.download_entitlements]
                            : [];
                        const zips = Array.isArray(file.zip_download_entitlements)
                          ? file.zip_download_entitlements
                          : file.zip_download_entitlements
                            ? [file.zip_download_entitlements]
                            : [];
                        return [
                          ...originals.map((ent) => ({ ent, type: "original" as const })),
                          ...zips.map((ent) => ({ ent, type: "zip" as const })),
                        ].map(({ ent, type }) => {
                          const key = `${type}:${ent.id}`;
                          const expired = ent.expires_at <= new Date().toISOString();
                          const exhausted = ent.used_downloads >= ent.max_downloads;
                          const label =
                            type === "original"
                              ? lang === "ar"
                                ? "تنزيل الملف الأصلي"
                                : lang === "en"
                                  ? "Download original"
                                  : "Télécharger l’original"
                              : lang === "ar"
                                ? "تنزيل ZIP"
                                : lang === "en"
                                  ? "Download ZIP"
                                  : "Télécharger ZIP";
                          return (
                            <div key={key} className="text-end">
                              <button
                                type="button"
                                disabled={busy === key || expired || exhausted}
                                onClick={() => download(ent.id, type)}
                                className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                              >
                                {busy === key ? m.loading : label}
                              </button>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {m.downloadsLeft}:{" "}
                                {Math.max(0, ent.max_downloads - ent.used_downloads)} · {m.expires}{" "}
                                {new Date(ent.expires_at).toLocaleDateString(locale)}
                              </p>
                              <p className="text-xs text-muted-foreground">{file.file_name}</p>
                            </div>
                          );
                        });
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
