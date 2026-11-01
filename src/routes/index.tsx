import { createFileRoute, Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatTND } from "@/lib/money";
import { Menu, X, BookOpen, LayoutTemplate, Printer, CalendarCheck, GraduationCap, Laptop, Headphones, Video, Palette, Sparkles } from "lucide-react";
import banner from "@/assets/homepage-banner.jpg.asset.json";

const CATEGORIES = [
  ["ebook", BookOpen, "bg-rose-50 text-rose-700 border-rose-200"],
  ["template", LayoutTemplate, "bg-sky-50 text-sky-700 border-sky-200"],
  ["printable", Printer, "bg-amber-50 text-amber-700 border-amber-200"],
  ["planner", CalendarCheck, "bg-violet-50 text-violet-700 border-violet-200"],
  ["course", GraduationCap, "bg-emerald-50 text-emerald-700 border-emerald-200"],
  ["software", Laptop, "bg-cyan-50 text-cyan-700 border-cyan-200"],
  ["audio", Headphones, "bg-orange-50 text-orange-700 border-orange-200"],
  ["video", Video, "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200"],
  ["graphics", Palette, "bg-lime-50 text-lime-700 border-lime-200"],
  ["other", Sparkles, "bg-pink-50 text-pink-700 border-pink-200"],
] as const;
import { BrandLogo } from "@/components/BrandLogo";
import { LANGS, dict, useLang } from "@/lib/i18n";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Algorea Bazaar — Ressources numériques créatives" },
      {
        name: "description",
        content:
          "Algorea Bazaar : boutique de produits numériques éducatifs et créatifs, en français, arabe et anglais.",
      },
      { property: "og:title", content: "Algorea Bazaar — Ressources numériques créatives" },
      {
        property: "og:description",
        content: "Produits numériques éducatifs et créatifs multilingues.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const { lang, setLang, t } = useLang();
  const [open, setOpen] = useState(false);
  const { session } = useSession();
  const adminRole = useQuery({
    queryKey: ["current-user-admin", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: session!.user.id,
        _role: "admin",
      });
      if (error) throw error;
      return data === true;
    },
  });
  const isAdmin = adminRole.data === true;
  const accountLabel = session ? t.auth.account : t.auth.signIn;
  // Public platform-owned storefront: resolve the official store by its stable slug.
  const platformStoreQuery = useQuery({
    queryKey: ["home-platform-store", "feata-create"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,slug")
        .eq("slug", "feata-create")
        .eq("status", "active")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const platformProductsQuery = useQuery({
    queryKey: ["home-platform-products", platformStoreQuery.data?.id],
    enabled: !!platformStoreQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,description,price_millimes,product_type,image_path")
        .eq("store_id", platformStoreQuery.data!.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
  const platformProductsTitle = lang === "ar" ? "منتجات تابعة للمنصة" : lang === "en" ? "Platform Products" : "Produits de la plateforme";
  const platformProductsEmpty = lang === "ar" ? "لا توجد منتجات نشطة تابعة للمنصة حالياً." : lang === "en" ? "There are no active platform products yet." : "Aucun produit actif de la plateforme pour le moment.";
  const platformProductsLoading = lang === "ar" ? "جارٍ تحميل منتجات المنصة…" : lang === "en" ? "Loading platform products…" : "Chargement des produits de la plateforme…";
  const platformProductsError = lang === "ar" ? "تعذر تحميل منتجات المنصة." : lang === "en" ? "Could not load platform products." : "Impossible de charger les produits de la plateforme.";
  const platformLatestQuery = useQuery({
    queryKey: ["home-platform-latest-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,description,price_millimes,product_type,image_path")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
  const platformLatestTitle = lang === "ar" ? "أحدث منتجات البائعين" : lang === "en" ? "Latest seller products" : "Derniers produits des vendeurs";
  const platformLatestEmpty = lang === "ar" ? "لا توجد منتجات منشورة حالياً." : lang === "en" ? "There are no published products yet." : "Aucun produit publié pour le moment.";
  const platformLatestLoading = lang === "ar" ? "جارٍ تحميل أحدث المنتجات…" : lang === "en" ? "Loading the latest products…" : "Chargement des derniers produits…";
  const platformLatestError = lang === "ar" ? "تعذر تحميل أحدث المنتجات." : lang === "en" ? "Could not load the latest products." : "Impossible de charger les derniers produits.";

  const links = [
    ["#home", t.nav.home],
    ["/seller", t.marketplace.sellerArea],
    ["#about", t.nav.about],
    ["#contact", t.nav.contact],
  ] as const;

  const switcher = (
    <div
      className="flex shrink-0 rounded-full border border-border bg-card p-1"
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          lang={l}
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition-colors ${
            lang === l ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
          }`}
          title={dict[l].langName}
        >
          {l}
        </button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20">
          <a href="#home" className="flex h-12 w-28 shrink-0 md:h-14 md:w-36">
            <BrandLogo slotLabel={t.logoSlot} className="h-full w-full" />
          </a>
          <nav className="hidden items-center gap-7 md:flex">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="text-sm font-medium hover:text-coral">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Link
                to="/admin"
                className="hidden text-sm font-semibold text-coral hover:underline lg:inline"
              >
                {t.admin.title}
              </Link>
            )}
            {session && (
              <Link
                to="/orders"
                className="hidden text-sm font-semibold text-coral hover:underline lg:inline"
              >
                {t.marketplace.myOrders}
              </Link>
            )}
            <Link
              to={session ? "/account" : "/auth"}
              aria-label={accountLabel}
              className="inline-flex items-center gap-1.5 rounded-full p-2 text-sm font-semibold hover:text-coral md:px-3"
            >
              <User className="h-5 w-5" />
              <span className="hidden lg:inline">{accountLabel}</span>
            </Link>
            {switcher}
            <button
              className="rounded-md p-2 md:hidden"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={t.menu}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {open && (
          <nav className="border-t border-border bg-background px-4 py-3 md:hidden">
            {links.map(([href, label]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="block py-3 font-medium"
              >
                {label}
              </a>
            ))}
          </nav>
        )}
      </header>

      <main>
        <section aria-labelledby="cats" className="bg-background">
          <div className="mx-auto max-w-6xl px-3 py-4 md:px-4 md:py-6">
            <h2 id="cats" className="mb-3 text-center text-lg font-bold text-petrol md:mb-4 md:text-xl">{t.marketplace.browseCategories}</h2>
            <div className="grid grid-cols-5 gap-2 md:gap-3">
              {CATEGORIES.map(([id, Icon, colorClass]) => (
                <Link key={id} to="/catalog" search={{ type: id }}
                  className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-card px-1.5 py-3 text-center text-[11px] font-semibold transition hover:-translate-y-0.5 hover:shadow-sm sm:min-h-24 sm:gap-2 sm:px-2 sm:text-sm">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full border sm:h-11 sm:w-11 ${colorClass}`}>
                    <Icon className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden />
                  </span>
                  <span className="leading-tight">{t.marketplace[id]}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
        <img src={banner.url} alt="Algorea Bazaar" className="block h-auto w-full" />
        <section aria-labelledby="platform-owned-products" className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="platform-owned-products" className="mb-5 text-xl font-bold text-petrol">{platformProductsTitle}</h2>
            {platformStoreQuery.isPending || platformProductsQuery.isPending ? (
              <p className="py-5 text-center text-muted-foreground">{platformProductsLoading}</p>
            ) : platformStoreQuery.isError || platformProductsQuery.isError ? (
              <p role="alert" className="py-5 text-center text-muted-foreground">{platformProductsError}</p>
            ) : !platformStoreQuery.data || !platformProductsQuery.data?.length ? (
              <p className="py-5 text-center text-muted-foreground">{platformProductsEmpty}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {platformProductsQuery.data.map((product) => (
                  <article key={product.id} className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream-light p-5">
                      {product.image_path ? (
                        <img src={supabase.storage.from("product-images").getPublicUrl(product.image_path).data.publicUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-3xl font-bold text-petrol/50">AB</span>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="text-xs text-muted-foreground">{t.marketplace[product.product_type as keyof typeof t.marketplace] ?? product.product_type}</p>
                      <Link to="/products/$id" params={{ id: product.id }} className="block font-bold hover:text-coral">{product.name}</Link>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                      <p className="text-lg font-extrabold">{formatTND(product.price_millimes)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
        <section aria-labelledby="platform-latest-products" className="bg-cream-light">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="platform-latest-products" className="mb-5 text-xl font-bold text-petrol">{platformLatestTitle}</h2>
            {platformLatestQuery.isPending ? (
              <p className="py-5 text-center text-muted-foreground">{platformLatestLoading}</p>
            ) : platformLatestQuery.isError ? (
              <p role="alert" className="py-5 text-center text-muted-foreground">{platformLatestError}</p>
            ) : !platformLatestQuery.data?.length ? (
              <p className="py-5 text-center text-muted-foreground">{platformLatestEmpty}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {platformLatestQuery.data.map((product) => (
                  <article key={product.id} className="overflow-hidden rounded-xl border border-border bg-card">
                    <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-background p-5">
                      {product.image_path ? (
                        <img src={supabase.storage.from("product-images").getPublicUrl(product.image_path).data.publicUrl} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-3xl font-bold text-petrol/50">AB</span>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="text-xs text-muted-foreground">{t.marketplace[product.product_type as keyof typeof t.marketplace] ?? product.product_type}</p>
                      <Link to="/products/$id" params={{ id: product.id }} className="block font-bold hover:text-coral">{product.name}</Link>
                      <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                      <p className="text-lg font-extrabold">{formatTND(product.price_millimes)}</p>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
        <section id="home" className="bg-cream-light">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center md:py-24">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{t.heroKicker}</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground md:text-lg">{t.heroText}</p>
          </div>
        </section>

      </main>

      <footer id="contact" className="bg-petrol text-cream">
        <div id="about" className="mx-auto max-w-6xl px-4 py-8 text-center text-sm">
          © {new Date().getFullYear()} Algorea Bazaar. {t.footer}
        </div>
      </footer>
    </div>
  );
}
