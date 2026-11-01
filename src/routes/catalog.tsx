import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { AuthShell } from "@/components/AuthShell";
import { TndEquivalents } from "@/components/TndEquivalents";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalogue — Algorea Bazaar" },
      { name: "description", content: "Découvrez des produits numériques sur Algorea Bazaar." },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): { type?: string } =>
    typeof s["type"] === "string" ? { type: s["type"] } : {},
  component: CatalogPage,
});

type Product = {
  id: string;
  name: string;
  description: string;
  price_millimes: number;
  product_type: string;
  store_id: string | null;
  image_path: string | null;
};
type Store = { id: string; name: string; slug: string };

function CatalogPage() {
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const [search, setSearch] = useState("");
  const [type, setType] = useState(Route.useSearch().type ?? "all");
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,name,description,price_millimes,product_type,store_id,image_path")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const storeIds = [
        ...new Set((products ?? []).map((p) => p.store_id).filter((id): id is string => !!id)),
      ];
      const { data: stores, error: storesError } = storeIds.length
        ? await supabase.from("stores").select("id,name,slug").in("id", storeIds)
        : { data: [], error: null };
      if (storesError) throw storesError;
      return { products: (products ?? []) as Product[], stores: (stores ?? []) as Store[] };
    },
  });
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase();
    const storeMap = new Map((catalog.data?.stores ?? []).map((s) => [s.id, s]));
    return (catalog.data?.products ?? [])
      .filter((p) => {
        const store = p.store_id ? storeMap.get(p.store_id) : undefined;
        const matchesType = type === "all" || p.product_type === type;
        const matchesText =
          !q ||
          [p.name, p.description, store?.name ?? ""].some((v) => v.toLocaleLowerCase().includes(q));
        return matchesType && matchesText && !!store;
      })
      .map((p) => ({ ...p, store: storeMap.get(p.store_id!)! }));
  }, [catalog.data, search, type]);

  return (
    <AuthShell lang={lang} setLang={setLang} title={m.catalog} wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm font-semibold text-coral hover:underline">
          Algorea Bazaar
        </Link>
        <Link to="/seller" className="text-sm font-semibold text-coral hover:underline">
          {m.sellerArea}
        </Link>
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_220px]">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={m.search}
          className="w-full rounded-lg border border-input bg-background px-3 py-3"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded-lg border border-input bg-background px-3 py-3"
        >
          <option value="all">{m.allTypes}</option>
          {[
            "ebook",
            "template",
            "printable",
            "planner",
            "course",
            "software",
            "audio",
            "video",
            "graphics",
            "other",
          ].map((v) => (
            <option key={v} value={v}>
              {m[v as keyof typeof m]}
            </option>
          ))}
        </select>
      </div>
      {catalog.isPending ? (
        <p className="py-8 text-center">{m.loading}</p>
      ) : catalog.isError ? (
        <p role="alert" className="py-8 text-center">
          {m.error}
        </p>
      ) : !visible.length ? (
        <p className="py-8 text-center text-muted-foreground">{m.noCatalog}</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((p) => (
            <article key={p.id} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream-light p-6 text-center">
                {p.image_path ? (
                  <img
                    src={
                      supabase.storage.from("product-images").getPublicUrl(p.image_path).data
                        .publicUrl
                    }
                    alt={p.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-bold text-petrol/50">AB</span>
                )}
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {m[p.product_type as keyof typeof m] ?? p.product_type}
                  </p>
                  <Link
                    to="/products/$id"
                    params={{ id: p.id }}
                    className="mt-1 block font-bold hover:text-coral"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{p.description}</p>
                </div>
                <p className="text-lg font-extrabold">{formatTND(p.price_millimes)}<TndEquivalents millimes={p.price_millimes} locale={lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"} /></p>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  <Link
                    to="/stores/$slug"
                    params={{ slug: p.store.slug }}
                    className="text-sm font-semibold text-coral hover:underline"
                  >
                    {p.store.name}
                  </Link>
                  <span className="text-xs text-muted-foreground">{m.store}</span>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground">{m.tndNote}</p>
    </AuthShell>
  );
}
