import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { z } from "zod";
import { AuthShell } from "@/components/AuthShell";
import { supabase } from "@/integrations/supabase/client";
import { checkOrderPayment } from "@/lib/shop.functions";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { useCart } from "@/lib/cart";

const searchSchema = z.object({ order: z.string().uuid().optional() });

export const Route = createFileRoute("/checkout/return")({
  validateSearch: searchSchema,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
  },
  component: CheckoutReturnPage,
});

const copy = {
  fr: {
    title: "État de votre commande",
    paid: "Paiement confirmé. Votre commande est enregistrée.",
    pending: "Nous vérifions encore le paiement. Cette page se mettra à jour automatiquement.",
    failed: "Le paiement n’a pas été confirmé. Aucun téléchargement n’est disponible.",
    missing: "Commande introuvable ou accès non autorisé.",
    invalid: "Référence de commande invalide.",
    products: "Produits de cette commande",
    total: "Total",
    downloads: "Accéder à mes achats et télécharger chaque produit séparément",
    catalog: "Retour au catalogue",
    loading: "Vérification du paiement…",
    error: "Impossible de vérifier la commande pour le moment.",
  },
  ar: {
    title: "حالة طلبك",
    paid: "تم تأكيد الدفع وتسجيل طلبك بنجاح.",
    pending: "ما زلنا نتحقق من الدفع. ستُحدّث هذه الصفحة تلقائياً.",
    failed: "لم يتم تأكيد الدفع. لا تتوفر أي تنزيلات لهذا الطلب.",
    missing: "الطلب غير موجود أو ليس لديك إذن بالوصول إليه.",
    invalid: "مرجع الطلب غير صالح.",
    products: "منتجات هذا الطلب",
    total: "الإجمالي",
    downloads: "الانتقال إلى مشترياتي وتنزيل كل منتج على حدة",
    catalog: "العودة إلى الكتالوج",
    loading: "جارٍ التحقق من الدفع…",
    error: "تعذر التحقق من الطلب حالياً.",
  },
  en: {
    title: "Order status",
    paid: "Payment confirmed. Your order has been recorded.",
    pending: "We are still verifying the payment. This page will update automatically.",
    failed: "Payment was not confirmed. Downloads are unavailable for this order.",
    missing: "Order not found or you are not allowed to access it.",
    invalid: "Invalid order reference.",
    products: "Products in this order",
    total: "Total",
    downloads: "Open my purchases to download each product separately",
    catalog: "Back to catalog",
    loading: "Checking payment…",
    error: "Unable to verify the order right now.",
  },
} as const;

type OrderSummary = {
  id: string;
  status: string;
  total_millimes: number;
  order_items: Array<{
    id: string;
    product_id: string;
    product_name: string;
    unit_price_millimes: number;
  }>;
};

function CheckoutReturnPage() {
  const { order } = Route.useSearch();
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { remove } = useCart();

  const query = useQuery({
    queryKey: ["checkout-return-order", order],
    enabled: !!order,
    queryFn: async () => {
      await checkOrderPayment({ data: { orderId: order! } });
      const { data, error } = await supabase
        .from("orders")
        .select("id,status,total_millimes,order_items(id,product_id,product_name,unit_price_millimes)")
        .eq("id", order!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as unknown as OrderSummary | null;
    },
    refetchInterval: (q) => (q.state.data?.status === "pending" ? 5000 : false),
  });

  useEffect(() => {
    if (query.data?.status === "paid") {
      query.data.order_items.forEach((item) => remove(item.product_id));
    }
  }, [query.data?.status, query.data?.order_items, remove]);

  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";
  const message =
    query.data?.status === "paid"
      ? t.paid
      : query.data?.status === "pending"
        ? t.pending
        : query.data
          ? t.failed
          : query.isError
            ? t.error
            : t.missing;

  return (
    <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
      {!order ? (
        <p role="alert" className="rounded-xl bg-secondary p-4">
          {t.invalid}
        </p>
      ) : query.isPending ? (
        <p>{t.loading}</p>
      ) : (
        <>
          <p
            role={query.data?.status === "paid" ? "status" : "alert"}
            className="rounded-xl bg-secondary p-4"
          >
            {message}
          </p>
          {query.data && (
            <section className="mt-5 rounded-xl border border-border p-4">
              <div className="flex flex-wrap justify-between gap-2">
                <span className="text-sm text-muted-foreground">#{query.data.id.slice(0, 8)}</span>
                <strong>
                  {t.total}: {formatTND(query.data.total_millimes)}
                </strong>
              </div>
              <h2 className="mt-4 font-bold">{t.products}</h2>
              <ul className="mt-3 divide-y divide-border">
                {query.data.order_items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3 py-3">
                    <span>{item.product_name}</span>
                    <strong>{formatTND(item.unit_price_millimes)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {query.data?.status === "paid" && (
            <Link
              to="/orders"
              className="mt-5 inline-flex w-full justify-center rounded-full bg-accent px-5 py-3 text-center font-semibold text-accent-foreground"
            >
              {t.downloads}
            </Link>
          )}
          <Link
            to="/catalog"
            className="mt-4 inline-flex text-sm font-semibold text-coral hover:underline"
          >
            {t.catalog}
          </Link>
        </>
      )}
    </AuthShell>
  );
}
