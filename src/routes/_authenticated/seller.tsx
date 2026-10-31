import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/AuthShell";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/_authenticated/seller")({
  head: () => ({
    meta: [
      { title: "Espace vendeur — Algorea Bazaar" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SellerDashboard,
});

const copy = {
  fr: {
    title: "Espace vendeur",
    subtitle: "Suivez votre boutique et vos ventes numériques.",
    back: "Mon compte",
    store: "Ma boutique",
    noStore: "Aucune boutique n'est encore associée à votre compte.",
    noStoreNote: "La création de boutique sera accessible depuis le parcours d'inscription vendeur.",
    active: "Active",
    suspended: "Suspendue",
    products: "Produits",
    netSales: "Ventes nettes enregistrées",
    salesNote: "Cumul des montants nets inscrits au registre vendeur, pas un solde disponible au paiement.",
    recentProducts: "Produits récents",
    recentSales: "Ventes nettes récentes",
    noProducts: "Aucun produit pour le moment.",
    noSales: "Aucune vente enregistrée pour le moment.",
    product: "Produit",
    type: "Type",
    price: "Prix",
    date: "Date",
    status: "Statut",
    listed: "Publié",
    draft: "Non publié",
    loading: "Chargement…",
    error: "Impossible de charger les données. Réessayez plus tard.",
    payoutInfo: "Les versements sont prévus sur une base hebdomadaire et manuelle. Aucun transfert automatique n'est activé.",
    currency: "TND",
  },
  ar: {
    title: "مساحة البائع",
    subtitle: "تابع متجرك ومبيعاتك الرقمية.",
    back: "حسابي",
    store: "متجري",
    noStore: "لا يوجد متجر مرتبط بحسابك حتى الآن.",
    noStoreNote: "سيكون إنشاء المتجر متاحاً ضمن مسار تسجيل البائع.",
    active: "نشط",
    suspended: "معلّق",
    products: "المنتجات",
    netSales: "صافي المبيعات المسجّل",
    salesNote: "مجموع المبالغ الصافية المسجلة في دفتر البائع، وليس رصيداً متاحاً للسحب.",
    recentProducts: "أحدث المنتجات",
    recentSales: "أحدث المبيعات الصافية",
    noProducts: "لا توجد منتجات حالياً.",
    noSales: "لا توجد مبيعات مسجلة حالياً.",
    product: "المنتج",
    type: "النوع",
    price: "السعر",
    date: "التاريخ",
    status: "الحالة",
    listed: "منشور",
    draft: "غير منشور",
    loading: "جارٍ التحميل…",
    error: "تعذر تحميل البيانات. حاول لاحقاً.",
    payoutInfo: "التحويلات مقررة أسبوعياً وبطريقة يدوية. لا توجد تحويلات آلية مفعّلة.",
    currency: "د.ت",
  },
  en: {
    title: "Seller dashboard",
    subtitle: "Track your store and digital sales.",
    back: "My account",
    store: "My store",
    noStore: "No store is linked to your account yet.",
    noStoreNote: "Store creation will be available through the seller registration flow.",
    active: "Active",
    suspended: "Suspended",
    products: "Products",
    netSales: "Recorded net sales",
    salesNote: "Cumulative net amounts recorded in the seller ledger, not an available payout balance.",
    recentProducts: "Recent products",
    recentSales: "Recent net sales",
    noProducts: "No products yet.",
    noSales: "No sales recorded yet.",
    product: "Product",
    type: "Type",
    price: "Price",
    date: "Date",
    status: "Status",
    listed: "Published",
    draft: "Unpublished",
    loading: "Loading…",
    error: "Could not load dashboard data. Please try again later.",
    payoutInfo: "Payouts are planned weekly and manually. No automatic transfers are enabled.",
    currency: "TND",
  },
} as const;

function SellerDashboard() {
  const { lang, setLang } = useLang();
  const t = copy[lang];
  const { user } = Route.useRouteContext();
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";

  const storeQuery = useQuery({
    queryKey: ["seller-store", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id, name, slug, status, created_at")
        .eq("owner_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const storeId = storeQuery.data?.id;
  const productsQuery = useQuery({
    queryKey: ["seller-products", storeId],
    enabled: Boolean(storeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, product_type, price_millimes, is_active, created_at")
        .eq("store_id", storeId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const ledgerQuery = useQuery({
    queryKey: ["seller-ledger", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_ledger_entries")
        .select("id, amount_millimes, created_at, entry_type")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const money = (millimes: number) =>
    new Intl.NumberFormat(locale, { style: "currency", currency: "TND" }).format(millimes / 1000);
  const date = (value: string) => new Date(value).toLocaleDateString(locale);
  const loading = storeQuery.isPending || ledgerQuery.isPending || (Boolean(storeId) && productsQuery.isPending);
  const failed = storeQuery.isError || ledgerQuery.isError || productsQuery.isError;
  const netSales = (ledgerQuery.data ?? []).reduce((sum, entry) => sum + entry.amount_millimes, 0);

  return (
    <AuthShell lang={lang} setLang={setLang} title={t.title} wide>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        <Link to="/account" className="text-sm font-semibold text-coral hover:underline">{t.back}</Link>
      </div>

      {loading ? (
        <p className="py-8 text-center text-muted-foreground">{t.loading}</p>
      ) : failed ? (
        <p role="alert" className="rounded-xl bg-destructive/10 p-4 text-sm text-destructive">{t.error}</p>
      ) : !storeQuery.data ? (
        <section className="rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-bold">{t.store}</h2>
          <p className="mt-3">{t.noStore}</p>
          <p className="mt-2 text-sm text-muted-foreground">{t.noStoreNote}</p>
        </section>
      ) : (
        <>
          <section className="rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">{t.store}</p>
                <h2 className="mt-1 text-xl font-bold">{storeQuery.data.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground" dir="ltr">/{storeQuery.data.slug}</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1 text-sm font-semibold">
                {storeQuery.data.status === "active" ? t.active : t.suspended}
              </span>
            </div>
          </section>

          <section className="mt-5 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{t.products}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{productsQuery.data?.length ?? 0}</p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">{t.netSales}</p>
              <p className="mt-2 text-3xl font-bold tabular-nums">{money(netSales)}</p>
              <p className="mt-2 text-xs text-muted-foreground">{t.salesNote}</p>
            </div>
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">{t.recentProducts}</h2>
            {!productsQuery.data?.length ? (
              <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">{t.noProducts}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[520px] text-sm">
                  <thead className="bg-secondary text-start">
                    <tr>
                      <th className="p-3 text-start">{t.product}</th>
                      <th className="p-3 text-start">{t.type}</th>
                      <th className="p-3 text-start">{t.price}</th>
                      <th className="p-3 text-start">{t.status}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productsQuery.data.slice(0, 5).map((product) => (
                      <tr key={product.id} className="border-t border-border">
                        <td className="p-3 font-medium">{product.name}</td>
                        <td className="p-3">{product.product_type}</td>
                        <td className="p-3 whitespace-nowrap">{money(product.price_millimes)}</td>
                        <td className="p-3">{product.is_active ? t.listed : t.draft}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="mt-6">
            <h2 className="mb-3 text-lg font-bold">{t.recentSales}</h2>
            {!ledgerQuery.data?.length ? (
              <p className="rounded-xl bg-secondary p-4 text-sm text-muted-foreground">{t.noSales}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full min-w-[360px] text-sm">
                  <thead className="bg-secondary">
                    <tr>
                      <th className="p-3 text-start">{t.date}</th>
                      <th className="p-3 text-start">{t.type}</th>
                      <th className="p-3 text-end">{t.netSales}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerQuery.data.slice(0, 10).map((entry) => (
                      <tr key={entry.id} className="border-t border-border">
                        <td className="p-3">{date(entry.created_at)}</td>
                        <td className="p-3">{entry.entry_type}</td>
                        <td className="p-3 text-end font-semibold tabular-nums">{money(entry.amount_millimes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <p className="mt-6 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">{t.payoutInfo}</p>
        </>
      )}
    </AuthShell>
  );
}
