import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { AuthShell } from "@/components/AuthShell";

export const Route = createFileRoute("/products/$id")({
  head: () => ({ meta: [{ title: "Produit numérique — Algorea Bazaar" }] }),
  component: ProductPage,
});

function ProductPage() {
  const { id } = Route.useParams();
  const { lang, setLang, t } = useLang();
  const m = t.marketplace;
  const query = useQuery({
    queryKey: ["product-detail", id],
    queryFn: async () => {
      const { data: product, error } = await supabase
        .from("products")
        .select("id,name,description,price_millimes,product_type,store_id,image_path")
        .eq("id", id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!product?.store_id) return null;
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("id,name,slug")
        .eq("id", product.store_id)
        .eq("status", "active")
        .maybeSingle();
      if (storeError) throw storeError;
      return store ? { product, store } : null;
    },
  });
  return (
    <AuthShell lang={lang} setLang={setLang} title={m.products} wide>
      <div className="mb-5">
        <Link to="/catalog" className="text-sm font-semibold text-coral hover:underline">
          {m.viewCatalog}
        </Link>
      </div>
      {query.isPending ? (
        <p>{m.loading}</p>
      ) : query.isError ? (
        <p role="alert">{m.error}</p>
      ) : !query.data ? (
        <p className="rounded-xl bg-secondary p-5">{m.noCatalog}</p>
      ) : (
        <article className="mx-auto max-w-2xl">
          <div className="flex aspect-[16/7] items-center justify-center overflow-hidden rounded-2xl bg-cream-light text-4xl font-bold text-petrol/40">
            {query.data.product.image_path ? (
              <img
                src={supabase.storage.from("product-images").getPublicUrl(query.data.product.image_path).data.publicUrl}
                alt={query.data.product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              "Algorea Bazaar"
            )}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            {m[query.data.product.product_type as keyof typeof m] ??
              query.data.product.product_type}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">{query.data.product.name}</h1>
          <p className="mt-4 whitespace-pre-wrap leading-8 text-muted-foreground">
            {query.data.product.description}
          </p>
          <p className="mt-6 text-2xl font-extrabold">
            {formatTND(query.data.product.price_millimes)}
          </p>
          <Link
            to="/stores/$slug"
            params={{ slug: query.data.store.slug }}
            className="mt-5 inline-flex rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            {m.viewStore}: {query.data.store.name}
          </Link>
          <p className="mt-6 rounded-xl bg-secondary p-4 text-sm leading-7">
            {m.purchaseUnavailable}
          </p>
        </article>
      )}
    </AuthShell>
  );
}
