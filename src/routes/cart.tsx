import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { ProductPreview } from "@/components/ProductPreview";
import { localizedProductText } from "@/lib/product-translations";
import { AuthShell } from "@/components/AuthShell";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/cart")({ component: CartPage });

type Product = {
  id: string; name: string; price_millimes: number; image_path: string | null;
  name_translations: unknown; store_id: string | null;
};
type Store = { id: string; name: string };

const copy = {
  fr: { title: "Panier", empty: "Votre panier est vide.", browse: "Continuer mes achats", checkout: "Passer à la caisse", remove: "Retirer", quantity: "Quantité", subtotal: "Sous-total", unavailable: "Produit indisponible et retiré du panier.", limit: "50 produits différents maximum par panier." },
  ar: { title: "سلة المشتريات", empty: "سلة مشترياتك فارغة.", browse: "متابعة التسوق", checkout: "الانتقال إلى الدفع", remove: "حذف", quantity: "الكمية", subtotal: "المجموع الفرعي", unavailable: "منتج غير متاح، تمت إزالته من السلة.", limit: "الحد الأقصى 50 منتجاً مختلفاً في السلة." },
  en: { title: "Shopping cart", empty: "Your cart is empty.", browse: "Continue shopping", checkout: "Proceed to checkout", remove: "Remove", quantity: "Quantity", subtotal: "Subtotal", unavailable: "An unavailable product was removed from your cart.", limit: "Up to 50 different products per cart." },
} as const;

function CartPage() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { items, count, setQuantity, remove } = useCart();
  const query = useQuery({
    queryKey: ["cart-products", items.map((x) => x.productId).join(",")],
    enabled: items.length > 0,
    queryFn: async () => {
      const ids = items.map((x) => x.productId);
      const { data, error } = await supabase.from("products")
        .select("id,name,name_translations,price_millimes,image_path,store_id")
        .in("id", ids).eq("is_active", true);
      if (error) throw error;
      const storeIds = [...new Set((data ?? []).map((p) => p.store_id).filter((x): x is string => !!x))];
      const { data: stores, error: storeError } = storeIds.length
        ? await supabase.from("stores").select("id,name").in("id", storeIds).eq("status", "active")
        : { data: [], error: null };
      if (storeError) throw storeError;
      return { products: (data ?? []) as Product[], stores: (stores ?? []) as Store[] };
    },
  });
  const lines = useMemo(() => {
    const productMap = new Map((query.data?.products ?? []).map((p) => [p.id, p]));
    const storeMap = new Map((query.data?.stores ?? []).map((s) => [s.id, s]));
    return items.flatMap((line) => {
      const product = productMap.get(line.productId);
      const store = product?.store_id ? storeMap.get(product.store_id) : undefined;
      return product && store ? [{ ...line, product, store, total: product.price_millimes * line.quantity }] : [];
    });
  }, [items, query.data]);
  const total = lines.reduce((sum, line) => sum + line.total, 0);
  const unavailable = !query.isPending && lines.length !== items.length;

  return (
    <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
      <div className="mb-5 flex flex-wrap justify-between gap-3">
        <Link to="/catalog" className="text-sm font-semibold text-coral hover:underline">{t.browse}</Link>
        <span className="text-sm text-muted-foreground">{count}</span>
      </div>
      {items.length === 0 ? <p className="rounded-xl bg-secondary p-5">{t.empty}</p> :
        query.isPending ? <p>{lang === "ar" ? "جارٍ التحميل…" : lang === "en" ? "Loading…" : "Chargement…"}</p> :
        query.isError ? <p role="alert">{lang === "ar" ? "تعذر تحميل السلة." : lang === "en" ? "Could not load cart." : "Impossible de charger le panier."}</p> :
        <>
          {unavailable && <p role="status" className="mb-3 rounded-lg bg-secondary p-3 text-sm">{t.unavailable}</p>}
          <div className="space-y-3">
            {lines.map((line) => (
              <article key={line.productId} className="flex flex-wrap items-center gap-4 rounded-xl border border-border p-3">
                <div className="h-20 w-24 shrink-0 overflow-hidden rounded-lg bg-cream-light"><ProductPreview path={line.product.image_path} alt={line.product.name} /></div>
                <div className="min-w-0 flex-1">
                  <Link to="/products/$id" params={{ id: line.product.id }} className="font-bold hover:text-coral">{localizedProductText(line.product.name, line.product.name_translations, lang)}</Link>
                  <p className="text-xs text-muted-foreground">{line.store.name}</p>
                  <p className="mt-1 text-sm font-semibold">{formatTND(line.product.price_millimes)}</p>
                </div>
                <label className="flex items-center gap-2 text-sm">{t.quantity}
                  <input type="number" min={1} max={99} value={line.quantity} onChange={(e) => setQuantity(line.productId, Number(e.target.value))} className="w-20 rounded-lg border border-input bg-background px-2 py-2" />
                </label>
                <div className="text-end">
                  <p className="font-bold">{formatTND(line.total)}</p>
                  <button type="button" onClick={() => remove(line.productId)} className="mt-1 text-xs text-destructive hover:underline">{t.remove}</button>
                </div>
              </article>
            ))}
          </div>
          <div className="mt-6 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-lg font-extrabold"><span>{t.subtotal}</span><span>{formatTND(total)}</span></div>
            <p className="mt-2 text-xs text-muted-foreground">{t.limit}</p>
            <Link to="/checkout" className="mt-5 inline-flex w-full justify-center rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground">{t.checkout}</Link>
          </div>
        </>}
    </AuthShell>
  );
}
