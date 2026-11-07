import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { TndEquivalents } from "@/components/TndEquivalents";
import { loadProductGallery } from "@/lib/product-previews";
import { ProductPreview } from "@/components/ProductPreview";
import { localizedProductText } from "@/lib/product-translations";
import { AuthShell } from "@/components/AuthShell";
import { PaymentMethodsPreview } from "@/components/PaymentMethodsPreview";

function PaymentBrandLogo({ brand }: { brand: string }) {
  const styles: Record<string, string> = {
    KONNECT: "bg-[#102f3d] text-white",
    VISA: "bg-[#1434a4] text-white italic",
    Cards: "bg-white text-[#1434a4] ring-1 ring-border",
    Mastercard: "bg-white text-[#eb001b] ring-1 ring-border",
    "e-DINAR": "bg-[#f4efe6] text-[#8b6b20] ring-1 ring-[#c5a869]",
    iPay: "bg-[#e8f3ff] text-[#1769aa] ring-1 ring-[#b7d7f0]",
    D17: "bg-[#f1e9fb] text-[#7136a8] ring-1 ring-[#d7c2ef]",
    Flouci: "bg-[#e7f8f1] text-[#07845a] ring-1 ring-[#b9e7d5]",
    ClicToPay: "bg-[#e9efff] text-[#2448a5] ring-1 ring-[#c4d1fa]",
    Ooredoo: "bg-[#fff0f0] text-[#d71920] ring-1 ring-[#f5c4c6]",
    "Tunisie Telecom": "bg-[#e8f5ff] text-[#0877b9] ring-1 ring-[#b9def4]",
    WinSMS: "bg-[#fff4e8] text-[#a65308] ring-1 ring-[#f1d1ad]",
    "Postal / Bank": "bg-[#f4f0e8] text-[#75613d] ring-1 ring-[#ded3bd]",
  };
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 min-w-16 shrink-0 items-center justify-center rounded-lg px-2 text-xs font-extrabold tracking-tight ${styles[brand] ?? "bg-secondary text-foreground"}`}
    >
      {brand === "Mastercard" ? (
        <span className="flex items-center -space-x-2">
          <span className="h-5 w-5 rounded-full bg-[#eb001b]" />
          <span className="h-5 w-5 rounded-full bg-[#f79e1b]/95" />
        </span>
      ) : brand === "Cards" ? (
        <span className="flex items-center gap-2"><span className="font-black italic text-[#1434a4]">VISA</span><span className="flex -space-x-2"><span className="h-4 w-4 rounded-full bg-[#eb001b]" /><span className="h-4 w-4 rounded-full bg-[#f79e1b]" /></span></span>
      ) : brand}
    </span>
  );
}

export const Route = createFileRoute("/products/$id")({
  head: () => ({
    meta: [
      { title: "Produit numérique — Algorea Bazaar" },
      { name: "description", content: "Découvrez ce produit numérique sur Algorea Bazaar." },
      { property: "og:title", content: "Produit numérique — Algorea Bazaar" },
      { property: "og:description", content: "Découvrez ce produit numérique sur Algorea Bazaar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
        .select(
          "id,name,description,name_translations,description_translations,price_millimes,product_type,store_id,image_path",
        )
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
      if (!store) return null;
      const gallery = await loadProductGallery(product.id);
      return { product, store, gallery: gallery.images };
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
          <div className="space-y-3">
            <div className="flex aspect-[16/7] items-center justify-center overflow-hidden rounded-2xl bg-cream-light text-4xl font-bold text-petrol/40">
              <ProductPreview path={query.data.product.image_path} alt={query.data.product.name} />
            </div>
            {query.data.gallery.length > 0 && (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {query.data.gallery.map(
                  (image: { id: string; image_path: string }, index: number) => (
                    <div
                      key={image.id}
                      className="flex aspect-square items-center justify-center overflow-hidden rounded-lg bg-cream-light"
                    >
                      <ProductPreview
                        path={image.image_path}
                        alt={`${query.data?.product.name ?? "Algorea Bazaar"} — ${index + 1}`}
                      />
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            {m[query.data.product.product_type as keyof typeof m] ??
              query.data.product.product_type}
          </p>
          <h1 className="mt-2 text-2xl font-extrabold">
            {localizedProductText(
              query.data.product.name,
              query.data.product.name_translations,
              lang,
            )}
          </h1>
          <p className="mt-4 whitespace-pre-wrap leading-8 text-muted-foreground">
            {localizedProductText(
              query.data.product.description,
              query.data.product.description_translations,
              lang,
            )}
          </p>
          <p className="mt-6 text-2xl font-extrabold">
            {formatTND(query.data.product.price_millimes)}
            <TndEquivalents
              millimes={query.data.product.price_millimes}
              locale={lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"}
            />
          </p>
          <Link
            to="/stores/$slug"
            params={{ slug: query.data.store.slug }}
            className="mt-5 inline-flex rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-secondary"
          >
            {m.viewStore}: {query.data.store.name}
          </Link>
          <section
            className="mt-7 rounded-2xl border border-border bg-card p-5"
            aria-label={m.paymentMethodsTitle}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-bold">{m.paymentMethodsTitle}</h2>
              <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-muted-foreground">
                {m.paymentMethodsPlanned}
              </span>
            </div>
            <PaymentMethodsPreview />
          </section>
        </article>
      )}
    </AuthShell>
  );
}
