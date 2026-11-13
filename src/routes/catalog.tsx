import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { TndEquivalents } from "@/components/TndEquivalents";
import {
  PRODUCT_CATEGORIES,
  getProductTypeLabel,
  getSubcategoryLabel,
} from "@/lib/product-categories";
import { ProductPreview } from "@/components/ProductPreview";
import { localizedProductText } from "@/lib/product-translations";
import { AuthShell } from "@/components/AuthShell";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/catalog")({
  head: () => ({
    meta: [
      { title: "Catalogue — Algorea Bazaar" },
      { name: "description", content: "Découvrez des produits numériques sur Algorea Bazaar." },
      { property: "og:title", content: "Catalogue — Algorea Bazaar" },
      {
        property: "og:description",
        content: "Découvrez des produits numériques sur Algorea Bazaar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
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
  sale_price_millimes: number | null;
  product_type: string;
  product_subcategory: string | null;
  store_id: string | null;
  image_path: string | null;
  name_translations: unknown;
  description_translations: unknown;
};
type Store = { id: string; name: string; slug: string };

function CatalogPage() {
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const { add, count, items } = useCart();
  const [search, setSearch] = useState("");
  const [type, setType] = useState(Route.useSearch().type ?? "all");
  const catalog = useQuery({
    queryKey: ["catalog"],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select(
          "id,name,description,name_translations,description_translations,price_millimes,sale_price_millimes,product_type,product_subcategory,store_id,image_path",
        )
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
          [
            localizedProductText(p.name, p.name_translations, lang),
            localizedProductText(p.description, p.description_translations, lang),
            store?.name ?? "",
          ].some((v) => v.toLocaleLowerCase().includes(q));
        return matchesType && matchesText && !!store;
      })
      .flatMap((p) => {
        const store = p.store_id ? storeMap.get(p.store_id) : undefined;
        return store ? [{ ...p, store }] : [];
      });
  }, [catalog.data, search, type, lang]);

  return (
    <AuthShell lang={lang} setLang={setLang} title={m.catalog} wide>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link to="/" className="text-sm font-semibold text-coral hover:underline">
          Algorea Bazaar
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/cart" className="text-sm font-semibold text-coral hover:underline">
            {lang === "ar"
              ? `السلة (${count})`
              : lang === "en"
                ? `Cart (${count})`
                : `Panier (${count})`}
          </Link>
          <Link to="/seller" className="text-sm font-semibold text-coral hover:underline">
            {m.sellerArea}
          </Link>
        </div>
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
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name[lang]}
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
                <ProductPreview path={p.image_path} alt={p.name} />
              </div>
              <div className="space-y-3 p-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {getProductTypeLabel(
                      p.product_type,
                      lang,
                      m as unknown as Record<string, string>,
                    )}
                    {getSubcategoryLabel(p.product_type, p.product_subcategory, lang)
                      ? " · " + getSubcategoryLabel(p.product_type, p.product_subcategory, lang)
                      : ""}
                  </p>
                  <Link
                    to="/products/$id"
                    params={{ id: p.id }}
                    className="mt-1 block font-bold hover:text-coral"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {localizedProductText(p.description, p.description_translations, lang)}
                  </p>
                </div>
                <p className="flex flex-wrap items-center gap-2 text-lg font-extrabold">
                  {p.sale_price_millimes ? (
                    <>
                      <span className="rounded bg-red-100 px-2 py-1 text-xs font-bold text-red-700">
                        PROMO
                      </span>
                      <span className="text-sm text-muted-foreground line-through">
                        {formatTND(p.price_millimes)}
                      </span>
                      <span className="text-red-600">{formatTND(p.sale_price_millimes)}</span>
                      <TndEquivalents
                        millimes={p.sale_price_millimes}
                        locale={lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"}
                      />
                    </>
                  ) : (
                    <>
                      {formatTND(p.price_millimes)}
                      <TndEquivalents
                        millimes={p.price_millimes}
                        locale={lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"}
                      />
                    </>
                  )}
                </p>
                <button
                  type="button"
                  onClick={() => add(p.id)}
                  className={`w-full rounded-full px-4 py-2 text-sm font-semibold text-white transition-colors ${
                    items.some((item) => item.productId === p.id)
                      ? "bg-green-600 hover:bg-green-700"
                      : "bg-accent text-accent-foreground"
                  }`}
                >
                  {lang === "ar"
                    ? "أضف إلى السلة"
                    : lang === "en"
                      ? "Add to cart"
                      : "Ajouter au panier"}
                </button>
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
