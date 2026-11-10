import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/lib/cart";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { localizedProductText } from "@/lib/product-translations";
import { getIpayCheckoutAvailability, startCartIpayCheckout } from "@/lib/shop.functions";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

const copy = {
  fr: {
    title: "Récapitulatif de commande",
    total: "Total à payer",
    disabled:
      "Le paiement en ligne est temporairement désactivé. Votre panier est conservé ; aucune commande ni aucun débit ne sera créé.",
    back: "Retour au panier",
    methods: "Vous serez redirigé vers la page sécurisée iPay pour choisir le moyen de paiement disponible.",
    empty: "Votre panier est vide.",
    loading: "Chargement…",
    error: "Impossible de charger la commande.",
    unavailable: "Un ou plusieurs produits ne sont plus disponibles. Retournez au panier.",
    pay: "Continuer vers le paiement iPay",
    starting: "Préparation du paiement…",
    paymentError:
      "Le paiement n’a pas pu être initialisé. Aucun nouveau paiement ne sera lancé automatiquement. Réessayez uniquement après vérification de l’état de la commande.",
  },
  ar: {
    title: "مراجعة الطلب",
    total: "الإجمالي المستحق",
    disabled: "الدفع الإلكتروني معطّل مؤقتاً. ستبقى سلتك محفوظة، ولن يتم إنشاء طلب أو خصم أي مبلغ.",
    back: "العودة إلى السلة",
    methods: "سيتم تحويلك إلى صفحة iPay الآمنة لاختيار وسيلة الدفع المتاحة.",
    empty: "السلة فارغة.",
    loading: "جارٍ التحميل…",
    error: "تعذر تحميل الطلب.",
    unavailable: "منتج أو أكثر لم يعد متاحاً. عودي إلى السلة.",
    pay: "المتابعة إلى الدفع عبر iPay",
    starting: "جارٍ إعداد الدفع…",
    paymentError:
      "تعذر إعداد الدفع. لن تتم إعادة محاولة إنشاء عملية دفع تلقائياً. لا تعيدي المحاولة إلا بعد التحقق من حالة الطلب.",
  },
  en: {
    title: "Order summary",
    total: "Total due",
    disabled:
      "Online payment is temporarily disabled. Your cart is preserved; no order or charge will be created.",
    back: "Back to cart",
    methods: "You will be redirected to iPay’s secure page to choose an available payment method.",
    empty: "Your cart is empty.",
    loading: "Loading…",
    error: "Could not load order.",
    unavailable: "One or more products are no longer available. Return to your cart.",
    pay: "Continue to iPay payment",
    starting: "Preparing payment…",
    paymentError:
      "Payment could not be initialized. Another payment will not be started automatically. Retry only after checking the order status.",
  },
} as const;

function CheckoutPage() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { items } = useCart();
  const checkoutAttempt = useRef<{ signature: string; key: string } | null>(null);
  const signature = items
    .map((line) => line.productId)
    .sort()
    .join(",");

  const availability = useQuery({
    queryKey: ["cart-checkout-availability"],
    queryFn: () => getIpayCheckoutAvailability(),
    staleTime: 30_000,
  });

  const checkoutMutation = useMutation({
    mutationFn: async () => {
      if (!checkoutAttempt.current || checkoutAttempt.current.signature !== signature) {
        checkoutAttempt.current = { signature, key: crypto.randomUUID() };
      }
      return startCartIpayCheckout({
        data: {
          items: items.map(({ productId }) => ({ productId })),
          checkoutKey: checkoutAttempt.current.key,
        },
      });
    },
    onSuccess: (result) => {
      if (result.ok) window.location.assign(result.payUrl);
    },
  });

  const query = useQuery({
    queryKey: ["checkout-products", items.map((line) => line.productId).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,name_translations,price_millimes,sale_price_millimes")
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
      (products.find((product) => product.id === line.productId)?.sale_price_millimes ??
        products.find((product) => product.id === line.productId)?.price_millimes ??
        0),
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

              const salePrice = product.sale_price_millimes;
              return (
                <div
                  key={line.productId}
                  className="flex justify-between gap-3 border-b border-border pb-3"
                >
                  <span>{localizedProductText(product.name, product.name_translations, lang)}</span>
                  {salePrice != null ? (
                    <span className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-accent-foreground">
                        PROMO
                      </span>
                      <span className="text-sm text-muted-foreground line-through">
                        {formatTND(product.price_millimes)}
                      </span>
                      <strong className="text-destructive">{formatTND(salePrice)}</strong>
                    </span>
                  ) : (
                    <strong>{formatTND(product.price_millimes)}</strong>
                  )}
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
              <p className="text-sm text-muted-foreground">{t.methods}</p>
            </section>
          )}
          {availability.data?.enabled && !unavailable ? (
            <button
              type="button"
              onClick={() => checkoutMutation.mutate()}
              disabled={checkoutMutation.isPending}
              className="mt-4 inline-flex w-full justify-center rounded-full bg-accent px-5 py-3 text-center font-semibold text-accent-foreground disabled:opacity-50"
            >
              {checkoutMutation.isPending ? t.starting : t.pay}
            </button>
          ) : (
            <p role="status" className="mt-3 rounded-xl border border-border p-4 text-sm">
              {availability.isPending ? t.loading : t.disabled}
            </p>
          )}
          {checkoutMutation.isError || (checkoutMutation.data && !checkoutMutation.data.ok) ? (
            <p role="alert" className="mt-3 rounded-xl border border-border p-4 text-sm">
              {t.paymentError}
            </p>
          ) : null}
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
