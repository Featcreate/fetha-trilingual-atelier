import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { AuthShell } from "@/components/AuthShell";

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
        .select("id,name,slug")
        .eq("slug", slug)
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      if (!store) return null;
      const { data: products, error: productError } = await supabase
        .from("products")
        .select("id,name,description,price_millimes,product_type,image_path")
        .eq("store_id", store.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      if (productError) throw productError;
      return { store, products: products ?? [] };
    },
  });
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
          <div className="mb-6 rounded-xl bg-cream-light p-5">
            <p className="text-xs text-muted-foreground">{m.store}</p>
            <h1 className="mt-1 text-2xl font-bold">{storeQuery.data.store.name}</h1>
            <p className="mt-2 text-sm text-muted-foreground" dir="ltr">
              algoreabazaar / {storeQuery.data.store.slug}
            </p>
          </div>
          {!storeQuery.data.products.length ? (
            <p className="py-8 text-center text-muted-foreground">{m.noProducts}</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {storeQuery.data.products.map((p) => (
                <article key={p.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="mb-3 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg bg-cream-light text-3xl font-bold text-petrol/50">
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
                      "AB"
                    )}
                  </div>
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
                  <p className="mt-3 text-lg font-extrabold">{formatTND(p.price_millimes)}</p>
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
