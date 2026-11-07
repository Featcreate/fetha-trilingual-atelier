import { useState } from "react";
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
import { Building2, CreditCard, Mail, Radio, Smartphone, Wallet } from "lucide-react";

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
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState("konnect:bank_card");
  const konnectPaymentMethods = [
    { id: "konnect:bank_card", label: m.paymentKonnectBankCard, Icon: CreditCard },
    { id: "konnect:wallet", label: m.paymentKonnectWallet, Icon: Wallet },
    { id: "konnect:e-DINAR", label: m.paymentKonnectEdinar, Icon: Smartphone },
  ];
  const ipayPaymentMethods = [
    { id: "ipay:clictopay", label: m.paymentClicToPay, Icon: CreditCard },
    { id: "ipay:flouci", label: m.paymentFlouci, Icon: Wallet },
    { id: "ipay:postal", label: m.paymentPostal, Icon: Mail },
    { id: "ipay:ooredoo-sms", label: m.paymentOoredooSms, Icon: Smartphone },
    { id: "ipay:tunisie-telecom-sms", label: m.paymentTunisieTelecomSms, Icon: Radio },
    { id: "ipay:bank-transfer", label: m.paymentBankTransfer, Icon: Building2 },
    { id: "ipay:winsms", label: m.paymentWinSms, Icon: Smartphone },
  ];
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
            <p className="mt-3 text-sm text-muted-foreground">{m.paymentSelectPrompt}</p>
            <div className="mt-5 rounded-xl border border-border p-4">
              <h3 className="text-base font-bold">{m.paymentTunisiaTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{m.paymentTunisiaNote}</p>
              <h4 className="mt-4 text-sm font-bold">{m.paymentProviderKonnect}</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {konnectPaymentMethods.map(({ id, label, Icon }) => {
                const selected = selectedPaymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPaymentMethod(id)}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-petrol bg-cream-light ring-1 ring-petrol"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-petrol" />
                    <span className="flex-1 text-sm font-semibold">{label}</span>
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                      selected ? "border-petrol bg-petrol text-white" : "border-muted-foreground/40 text-transparent"
                    }`}>✓</span>
                  </button>
                );
              })}
            </div>
              <h4 className="mt-6 text-sm font-bold">{m.paymentProviderIpay}</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ipayPaymentMethods.map(({ id, label, Icon }) => {
                const selected = selectedPaymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPaymentMethod(id)}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-petrol bg-cream-light ring-1 ring-petrol"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-petrol" />
                    <span className="flex-1 text-sm font-semibold">{label}</span>
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                      selected ? "border-petrol bg-petrol text-white" : "border-muted-foreground/40 text-transparent"
                    }`}>✓</span>
                  </button>
                );
              })}
            </div>
            </div>
            <div className="mt-4 rounded-xl border border-border p-4">
              <h3 className="text-base font-bold">{m.paymentInternationalTitle}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{m.paymentInternationalNote}</p>
              <h4 className="mt-4 text-sm font-bold">{m.paymentProviderKonnect}</h4>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {konnectPaymentMethods.filter(({ id }) => id === "konnect:bank_card").map(({ id, label, Icon }) => {
                const selected = selectedPaymentMethod === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPaymentMethod(id)}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      selected
                        ? "border-petrol bg-cream-light ring-1 ring-petrol"
                        : "border-border bg-background hover:bg-secondary"
                    }`}
                  >
                    <Icon aria-hidden="true" className="h-6 w-6 shrink-0 text-petrol" />
                    <span className="flex-1 text-sm font-semibold">{label}</span>
                    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs ${
                      selected ? "border-petrol bg-petrol text-white" : "border-muted-foreground/40 text-transparent"
                    }`}>✓</span>
                  </button>
                );
              })}
            </div>
            </div>
            <p className="mt-4 rounded-xl bg-secondary p-4 text-sm leading-7">
              {m.purchaseUnavailable}
            </p>
          </section>
        </article>
      )}
    </AuthShell>
  );
}
