import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { AuthShell } from "@/components/AuthShell";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/checkout")({ component: CheckoutPage });

const copy = {
  fr: { title: "Récapitulatif de commande", items: "Articles", total: "Total à payer", disabled: "Le paiement en ligne est temporairement désactivé. Votre panier est conservé ; aucune commande ni aucun débit ne sera créé.", back: "Retour au panier", methods: "Un seul paiement sera demandé pour l'ensemble du panier lorsque le service sera activé." },
  ar: { title: "مراجعة الطلب", items: "المنتجات", total: "الإجمالي المستحق", disabled: "الدفع الإلكتروني معطّل مؤقتاً. ستبقى سلتك محفوظة، ولن يتم إنشاء طلب أو خصم أي مبلغ.", back: "العودة إلى السلة", methods: "سيتم طلب دفعة واحدة لكامل محتويات السلة عند تفعيل الخدمة." },
  en: { title: "Order summary", items: "Items", total: "Total due", disabled: "Online payment is temporarily disabled. Your cart is preserved; no order or charge will be created.", back: "Back to cart", methods: "One payment will cover the entire cart when checkout is activated." },
} as const;

function CheckoutPage() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { items } = useCart();
  const query = useQuery({
    queryKey: ["checkout-products", items.map((x) => x.productId).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,name,price_millimes")
        .in("id", items.map((x) => x.productId)).eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });
  const products = query.data ?? [];
  const total = items.reduce((sum, line) => sum + (products.find((p) => p.id === line.productId)?.price_millimes ?? 0) * line.quantity, 0);
  return (
    <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
      {items.length === 0 ? <p className="rounded-xl bg-secondary p-5">{lang === "ar" ? "السلة فارغة." : lang === "en" ? "Your cart is empty." : "Votre panier est vide."}</p> :
        query.isPending ? <p>{lang === "ar" ? "جارٍ التحميل…" : lang === "en" ? "Loading…" : "Chargement…"}</p> :
        query.isError ? <p role="alert">{lang === "ar" ? "تعذر تحميل الطلب." : lang === "en" ? "Could not load order." : "Impossible de charger la commande."}</p> :
        <>
          <div className="space-y-3">
            {items.map((line) => {
              const product = products.find((p) => p.id === line.productId);
              if (!product) return null;
              return <div key={line.productId} className="flex justify-between gap-3 border-b border-border pb-3"><span>{product.name} × {line.quantity}</span><strong>{formatTND(product.price_millimes * line.quantity)}</strong></div>;
            })}
          </div>
          <div className="mt-5 flex justify-between text-xl font-extrabold"><span>{t.total}</span><span>{formatTND(total)}</span></div>
          <p className="mt-4 rounded-xl bg-secondary p-4 text-sm">{t.methods}</p>
          <p role="status" className="mt-3 rounded-xl border border-border p-4 text-sm">{t.disabled}</p>
          <Link to="/cart" className="mt-5 inline-flex rounded-full border border-border px-5 py-3 text-sm font-semibold">{t.back}</Link>
        </>}
    </AuthShell>
  );
}
