import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AuthShell } from "@/components/AuthShell";
import { PaymentMethodsPreview } from "@/components/PaymentMethodsPreview";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { localizedProductText } from "@/lib/product-translations";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

const copy = {
  fr: {
    title: "Récapitulatif de commande",
    total: "Total à payer",
    disabled:
      "Le paiement en ligne est temporairement désactivé. Votre panier est conservé ; aucune commande ni aucun débit ne sera créé.",
    back: "Retour au panier",
    methods: "Un seul paiement couvrira l'ensemble du panier lorsque le service sera activé.",
    empty: "Votre panier est vide.",
    loading: "Chargement…",
    error: "Impossible de charger la commande.",
    unavailable: "Un ou plusieurs produits ne sont plus disponibles. Retournez au panier.",
  },
  ar: {
    title: "مراجعة الطلب",
    total: "الإجمالي المستحق",
    disabled: "الدفع الإلكتروني معطّل مؤقتاً. ستبقى سلتك محفوظة، ولن يتم إنشاء طلب أو خصم أي مبلغ.",
    back: "العودة إلى السلة",
    methods: "ستكون هناك دفعة واحدة لكامل محتويات السلة عند تفعيل الخدمة.",
    empty: "السلة فارغة.",
    loading: "جارٍ التحميل…",
    error: "تعذر تحميل الطلب.",
    unavailable: "منتج أو أكثر لم يعد متاحاً. عودي إلى السلة.",
  },
  en: {
    title: "Order summary",
    total: "Total due",
    disabled:
      "Online payment is temporarily disabled. Your cart is preserved; no order or charge will be created.",
    back: "Back to cart",
    methods: "One payment will cover the entire cart when checkout is activated.",
    empty: "Your cart is empty.",
    loading: "Loading…",
    error: "Could not load order.",
    unavailable: "One or more products are no longer available. Return to your cart.",
  },
} as const;

function CheckoutPage() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { items } = useCart();

  const query = useQuery({
    queryKey: ["checkout-products", items.map((line) => line.productId).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,name_translations,price_millimes")
        .in(
          "id",
          items.map((line) => line.productId),
        )
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  const products = query.data ?? [];
  const unavailable = !query.isPending && products.length !== items.length;
  const total = items.reduce(
    (sum, line) =>
      sum +
      (products.find((product) => product.id === line.productId)?.price_millimes ?? 0) *
        line.quantity,
    0,
  );

  return (
    <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
      {items.length === 0 ? (
        <p className="rounded-xl bg-secondary p-5">{t.empty}</p>
      ) : query.isPending ? (
        <p>{t.loading}</p>
      ) : query.isError ? (
        <p role="alert">{t.error}</p>
      ) : (
        <>
          <div className="space-y-3">
            {items.map((line) => {
              const product = products.find((item) => item.id === line.productId);
              if (!product) return null;

              return (
                <div
                  key={line.productId}
                  className="flex justify-between gap-3 border-b border-border pb-3"
                >
                  <span>
                    {localizedProductText(product.name, product.name_translations, lang)} ×{" "}
                    {line.quantity}
                  </span>
                  <strong>{formatTND(product.price_millimes * line.quantity)}</strong>
                </div>
              );
            })}
          </div>

          <div className="mt-5 flex justify-between text-xl font-extrabold">
            <span>{t.total}</span>
            <span>{formatTND(total)}</span>
          </div>

          <p className="mt-4 rounded-xl bg-secondary p-4 text-sm">{t.methods}</p>
          {unavailable ? (
            <p role="alert" className="mt-3 rounded-xl border border-border p-4 text-sm">
              {t.unavailable}
            </p>
          ) : (
            <section className="mt-5 rounded-xl border border-border p-4">
              <PaymentMethodsPreview />
            </section>
          )}
          <p role="status" className="mt-3 rounded-xl border border-border p-4 text-sm">
            {t.disabled}
          </p>
          <Link
            to="/cart"
            className="mt-5 inline-flex rounded-full border border-border px-5 py-3 text-sm font-semibold"
          >
            {t.back}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
