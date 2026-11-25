import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ShoppingCart, Trash2 } from "lucide-react";
import { AuthShell } from "@/components/AuthShell";
import { ProductPreview } from "@/components/ProductPreview";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { localizedProductText } from "@/lib/product-translations";

export const Route = createFileRoute("/cart")({ component: CartPage });

type Product = {
  id: string;
  name: string;
  price_millimes: number;
  sale_price_millimes: number | null;
  image_path: string | null;
  name_translations: unknown;
  store_id: string | null;
};
type Store = { id: string; name: string };

const copy = {
  fr: {
    title: "Panier",
    home: "Retour à l’accueil",
    empty: "Votre panier est vide.",
    browse: "Continuer mes achats",
    checkout: "Paiement temporairement indisponible",
    remove: "Retirer",
    subtotal: "Total à payer",
    unavailable: "Un produit n’est plus disponible. Retirez-le avant de poursuivre.",
    limit: "50 produits différents maximum par panier.",
    loading: "Chargement…",
    error: "Impossible de charger le panier.",
    disabled: "Version bêta : le paiement est temporairement désactivé. Vous pouvez continuer à parcourir la plateforme.",
  },
  ar: {
    title: "سلة المشتريات",
    home: "العودة إلى الصفحة الرئيسية",
    empty: "سلة مشترياتك فارغة.",
    browse: "متابعة التسوق",
    checkout: "الدفع غير متاح حالياً",
    remove: "حذف",
    subtotal: "الإجمالي المستحق",
    unavailable: "يوجد منتج لم يعد متاحاً. احذفيه قبل المتابعة.",
    limit: "الحد الأقصى 50 منتجاً مختلفاً في السلة.",
    loading: "جارٍ التحميل…",
    error: "تعذر تحميل السلة.",
    disabled: "المنصة في مرحلة تجريبية؛ الدفع غير متاح حالياً. يمكنك مواصلة التصفح.",
  },
  en: {
    title: "Shopping cart",
    home: "Back to home",
    empty: "Your cart is empty.",
    browse: "Continue shopping",
    checkout: "Payment temporarily unavailable",
    remove: "Remove",
    subtotal: "Total due",
    unavailable: "A product is no longer available. Remove it before continuing.",
    limit: "Up to 50 different products per cart.",
    loading: "Loading…",
    error: "Could not load cart.",
    disabled: "Beta version: payments are temporarily disabled. You can continue browsing the platform.",
  },
} as const;

function CartPage() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { items, count, remove } = useCart();

  const query = useQuery({
    queryKey: ["cart-products", items.map((line) => line.productId).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const ids = items.map((line) => line.productId);
      const { data, error } = await supabase
        .from("products")
        .select("id,name,name_translations,price_millimes,sale_price_millimes,image_path,store_id")
        .in("id", ids)
        .eq("is_active", true);
      if (error) throw error;

      const storeIds = [
        ...new Set(
          (data ?? []).map((product) => product.store_id).filter((id): id is string => !!id),
        ),
      ];
      const { data: stores, error: storeError } = storeIds.length
        ? await supabase.from("stores").select("id,name").in("id", storeIds).eq("status", "active")
        : { data: [], error: null };
      if (storeError) throw storeError;

      return {
        products: (data ?? []) as Product[],
        stores: (stores ?? []) as Store[],
      };
    },
  });

  const lines = useMemo(() => {
    const productMap = new Map(
      (query.data?.products ?? []).map((product) => [product.id, product]),
    );
    const storeMap = new Map((query.data?.stores ?? []).map((store) => [store.id, store]));

    return items.flatMap((line) => {
      const product = productMap.get(line.productId);
      const store = product?.store_id ? storeMap.get(product.store_id) : undefined;
      return product && store
        ? [
            {
              ...line,
              product,
              store,
              total: product.sale_price_millimes ?? product.price_millimes,
            },
          ]
        : [];
    });
  }, [items, query.data]);

  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const unavailable = !query.isPending && lines.length !== items.length;

  return (
    <AuthShell
      lang={lang}
      setLang={setLang}
      title={
        <span className="inline-flex items-center gap-2">
          <ShoppingCart className="h-6 w-6" aria-hidden="true" />
          <span>{t.title}</span>
        </span>
      }
      wide
    >
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link
            to="/"
            className="text-sm font-semibold text-foreground hover:text-coral hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral focus-visible:ring-offset-2"
          >
            {t.home}
          </Link>
          <Link to="/catalog" className="text-sm font-semibold text-coral hover:underline">
            {t.browse}
          </Link>
        </div>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>

      {items.length === 0 ? (
        <p className="rounded-xl bg-secondary p-5">{t.empty}</p>
      ) : query.isPending ? (
        <p>{t.loading}</p>
      ) : query.isError ? (
        <p role="alert">{t.error}</p>
      ) : (
        <>
          {unavailable && (
            <p role="status" className="mb-3 rounded-lg bg-secondary p-3 text-sm">
              {t.unavailable}
            </p>
          )}
          <div className="space-y-3">
            {lines.map((line) => (
              <article
                key={line.productId}
                className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3"
              >
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-cream-light">
                  <ProductPreview path={line.product.image_path} alt={line.product.name} />
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    to="/products/$id"
                    params={{ id: line.product.id }}
                    className="font-bold hover:text-coral"
                  >
                    {localizedProductText(line.product.name, line.product.name_translations, lang)}
                  </Link>
                  <p className="text-xs text-muted-foreground">{line.store.name}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {line.product.sale_price_millimes ? (
                      <>
                        <span className="text-xs font-bold text-red-600">PROMO</span>
                        <span className="text-muted-foreground line-through">
                          {formatTND(line.product.price_millimes)}
                        </span>
                        <span className="text-red-600">
                          {formatTND(line.product.sale_price_millimes)}
                        </span>
                      </>
                    ) : (
                      formatTND(line.product.price_millimes)
                    )}
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-bold">{formatTND(line.total)}</p>
                  <button
                    type="button"
                    onClick={() => remove(line.productId)}
                    className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm font-bold text-red-700 shadow-sm transition-colors hover:border-red-400 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    <span>{t.remove}</span>
                  </button>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-lg font-extrabold">
              <span>{t.subtotal}</span>
              <span>{formatTND(total)}</span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t.limit}</p>
            <div className="mt-5 space-y-3">
              <p
                role="status"
                className="rounded-lg bg-secondary p-3 text-sm text-muted-foreground"
              >
                {t.disabled}
              </p>
              <button
                type="button"
                disabled
                aria-disabled="true"
                className="inline-flex w-full justify-center rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t.checkout}
              </button>
            </div>
          </div>
        </>
      )}
    </AuthShell>
  );
}
