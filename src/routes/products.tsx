import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Search, PackageOpen, Store as StoreIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";

export const Route = createFileRoute("/products")({
  head: () => ({
    meta: [
      { title: "Produits numériques — Algorea Bazaar" },
      { name: "description", content: "Découvrez des produits numériques éducatifs et créatifs sur Algorea Bazaar." },
      { name: "robots", content: "index,follow" },
    ],
  }),
  component: ProductsPage,
});

type ProductCard = {
  id: string;
  name: string;
  description: string;
  price_millimes: number;
  product_type: string;
  image_url: string | null;
  store_name: string | null;
};

async function loadProducts(): Promise<ProductCard[]> {
  const { data: rows, error } = await supabase
    .from("products")
    .select("id, name, description, price_millimes, image_path, product_type, store_id, created_at")
    .eq("is_active", true)
    .not("store_id", "is", null)
    .order("created_at", { ascending: false });

  if (error) throw error;
  if (!rows?.length) return [];

  const storeIds = [...new Set(rows.map((row) => row.store_id).filter((id): id is string => Boolean(id)))];
  const storeNames = new Map<string, string>();

  if (storeIds.length) {
    const { data: stores, error: storeError } = await supabase
      .from("stores")
      .select("id, name")
      .in("id", storeIds)
      .eq("status", "active");
    if (storeError) throw storeError;
    for (const store of stores ?? []) storeNames.set(store.id, store.name);
  }

  return Promise.all(rows.map(async (row) => {
    let imageUrl: string | null = null;
    if (row.image_path) {
      const { data } = await supabase.storage
        .from("product-images")
        .createSignedUrl(row.image_path, 300);
      imageUrl = data?.signedUrl ?? null;
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      price_millimes: row.price_millimes,
      product_type: row.product_type,
      image_url: imageUrl,
      store_name: row.store_id ? storeNames.get(row.store_id) ?? null : null,
    };
  }));
}

function ProductsPage() {
  const { lang, setLang, t } = useLang();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const products = useQuery({
    queryKey: ["public-products"],
    queryFn: loadProducts,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase(lang);
    return (products.data ?? []).filter((product) => {
      const matchesType = type === "all" || product.product_type === type;
      const searchable = `${product.name} ${product.description} ${product.store_name ?? ""}`.toLocaleLowerCase(lang);
      return matchesType && (!needle || searchable.includes(needle));
    });
  }, [products.data, search, type, lang]);

  const types = Object.entries(t.catalog.types) as [string, string][];

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <Link to="/" className="text-base font-bold text-foreground hover:text-coral">Algorea Bazaar</Link>
          <div className="flex items-center gap-2">
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-full border border-border px-4 py-2 text-sm font-semibold hover:bg-secondary">
              {t.auth.signUp}
            </Link>
            <div className="flex rounded-full border border-border bg-card p-1" role="group" aria-label="Language">
              {(["fr", "ar", "en"] as const).map((value) => (
                <button key={value} type="button" onClick={() => setLang(value)} aria-pressed={lang === value} lang={value}
                  className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${lang === value ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"}`}>
                  {value}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-4 py-10 md:py-14">
        <div className="max-w-3xl">
          <p className="text-sm font-bold uppercase tracking-wider text-gold">Algorea Bazaar</p>
          <h1 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">{t.catalog.title}</h1>
          <p className="mt-4 text-base leading-7 text-muted-foreground md:text-lg">{t.catalog.subtitle}</p>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-[1fr_240px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} type="search"
              placeholder={t.catalog.search} aria-label={t.catalog.search}
              className="h-12 w-full rounded-xl border border-input bg-card ps-12 pe-4 text-base outline-none focus:ring-2 focus:ring-ring" />
          </label>
          <select value={type} onChange={(event) => setType(event.target.value)} aria-label={t.catalog.allTypes}
            className="h-12 rounded-xl border border-input bg-card px-4 text-base outline-none focus:ring-2 focus:ring-ring">
            <option value="all">{t.catalog.allTypes}</option>
            {types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </div>

        {products.isPending && (
          <p role="status" className="py-16 text-center text-base text-muted-foreground">{t.catalog.loading}</p>
        )}

        {products.isError && (
          <p role="alert" className="mt-8 rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-base text-destructive">
            {t.catalog.loadError}
          </p>
        )}

        {products.isSuccess && filtered.length === 0 && (
          <div className="mt-10 rounded-2xl border border-dashed border-border bg-card px-6 py-14 text-center">
            <PackageOpen className="mx-auto h-10 w-10 text-gold" />
            <h2 className="mt-4 text-xl font-bold">{search || type !== "all" ? t.catalog.noMatch : t.catalog.emptyTitle}</h2>
            <p className="mx-auto mt-2 max-w-xl text-base leading-7 text-muted-foreground">
              {search || type !== "all" ? t.catalog.noMatch : t.catalog.emptyText}
            </p>
            <Link to="/" className="mt-6 inline-flex rounded-full bg-primary px-5 py-3 text-base font-semibold text-primary-foreground hover:opacity-90">
              {t.auth.back}
            </Link>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
                <div className="flex aspect-[16/10] items-center justify-center bg-cream-light">
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <PackageOpen className="h-12 w-12 text-gold" aria-hidden="true" />
                  )}
                </div>
                <div className="space-y-3 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold text-foreground">
                      {t.catalog.types[product.product_type as keyof typeof t.catalog.types] ?? product.product_type}
                    </span>
                    <span className="text-lg font-extrabold tabular-nums">{formatTND(product.price_millimes)}</span>
                  </div>
                  <h2 className="text-lg font-bold leading-snug">{product.name}</h2>
                  <p className="line-clamp-3 min-h-[4.5rem] text-base leading-6 text-muted-foreground">{product.description}</p>
                  {product.store_name && (
                    <p className="flex items-center gap-2 border-t border-border pt-3 text-sm text-muted-foreground">
                      <StoreIcon className="h-4 w-4" aria-hidden="true" />
                      {t.catalog.store}: {product.store_name}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
