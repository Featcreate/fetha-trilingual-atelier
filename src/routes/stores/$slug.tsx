import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { TndEquivalents } from "@/components/TndEquivalents";
import { AuthShell } from "@/components/AuthShell";
import { localizedProductText } from "@/lib/product-translations";
import { ProductPreview } from "@/components/ProductPreview";

export const Route = createFileRoute("/stores/$slug")({
  head: () => ({ meta: [{ title: "Boutique — Algorea Bazaar" }] }),
  component: StorefrontPage,
});

function StorefrontPage() {
  const { slug } = Route.useParams();
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const storeQuery = useQuery({
    queryKey: ["storefront", slug],
    queryFn: async () => {
      const { data: store, error } = await supabase
        .from("stores")
        .select("id,name,slug,logo_path,avatar_path,banner_path")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const { data: products, error: productError } = await supabase
        .from("products")
        .select(
          "id,name,description,name_translations,description_translations,price_millimes,sale_price_millimes,product_type,image_path",
        )
        .eq("store_id", store.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (productError) throw productError;
      return { store, products: products ?? [] };
    },
  });
  const assetUrl = (path: string | null) =>
    path ? supabase.storage.from("store-assets").getPublicUrl(path).data.publicUrl : null;

  return (
    <AuthShell lang={lang} setLang={setLang} title={storeQuery.data?.store.name ?? m.store} wide>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link to="/catalog" className="text-sm font-semibold text-coral hover:underline">
          {m.viewCatalog}
        </Link>
        <Link to="/seller" className="text-sm font-semibold text-coral hover:underline">
          {m.sellerArea}
        </Link>
      </div>
      {storeQuery.isPending ? (
        <p>{m.loading}</p>
      ) : storeQuery.isError ? (
        <p role="alert">{m.error}</p>
      ) : !storeQuery.data ? (
        <p className="rounded-xl bg-secondary p-5">{m.noCatalog}</p>
      ) : (
        <>
          <header className="mb-6 overflow-hidden rounded-xl border border-border bg-cream-light">
            {assetUrl(storeQuery.data.store.banner_path) && (
              <img
                src={assetUrl(storeQuery.data.store.banner_path)!}
                alt={m.storeBanner}
                className="h-36 w-full object-cover sm:h-52"
              />
            )}
            <div className="flex flex-wrap items-center gap-4 p-5">
              {assetUrl(storeQuery.data.store.logo_path) ? (
                <img
                  src={assetUrl(storeQuery.data.store.logo_path)!}
                  alt={m.storeLogo}
                  className="h-20 w-20 rounded-xl border border-border bg-white object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white text-2xl font-bold text-petrol">
                  AB
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{m.store}</p>
                <h1 className="mt-1 text-2xl font-bold">{storeQuery.data.store.name}</h1>
                <p className="mt-2 text-sm text-muted-foreground" dir="ltr">
                  algoreabazaar / {storeQuery.data.store.slug}
                </p>
              </div>
              {assetUrl(storeQuery.data.store.avatar_path) && (
                <div className="flex items-center gap-2">
                  <img
                    src={assetUrl(storeQuery.data.store.avatar_path)!}
                    alt={m.sellerAvatar}
                    className="h-12 w-12 rounded-full object-cover"
                  />
                  <span className="text-xs text-muted-foreground">{m.sellerAvatar}</span>
                </div>
              )}
            </div>
          </header>
          {!storeQuery.data.products.length ? (
            <p className="py-8 text-center text-muted-foreground">{m.noProducts}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storeQuery.data.products.map((p) => (
                <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-cream-light text-3xl font-bold text-petrol/50">
                    <ProductPreview
                      path={p.image_path}
                      alt={localizedProductText(p.name, p.name_translations, lang)}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {m[p.product_type as keyof typeof m] ?? p.product_type}
                  </p>
                  <Link
                    to="/products/$id"
                    params={{ id: p.id }}
                    className="mt-1 block font-bold hover:text-coral"
                  >
                    {localizedProductText(p.name, p.name_translations, lang)}
                  </Link>
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">
                    {localizedProductText(p.description, p.description_translations, lang)}
                  </p>
                  <p className="mt-3 flex flex-wrap items-center gap-2 text-lg font-extrabold">
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
                </article>
              ))}
            </div>
          )}
        </>
      )}
      <p className="mt-8 text-xs text-muted-foreground">{m.tndNote}</p>
    </AuthShell>
  );
}
