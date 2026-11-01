import { createFileRoute, Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Menu, X, BookOpen, LayoutTemplate, Printer, CalendarCheck, GraduationCap, Laptop, Headphones, Video, Palette, Sparkles, FileText, BookMarked, Package, AppWindow, ClipboardList, Layers } from "lucide-react";
import banner from "@/assets/homepage-banner.jpg.asset.json";

const CATEGORIES = [
  ["ebook", BookOpen], ["pdf", FileText], ["template", LayoutTemplate], ["educational", BookMarked],
  ["bundle", Package], ["software", Laptop], ["app", AppWindow], ["printable", Printer],
  ["planner", CalendarCheck], ["course", GraduationCap], ["worksheets", ClipboardList],
  ["flashcards", Layers], ["audio", Headphones], ["video", Video], ["graphics", Palette], ["other", Sparkles],
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

  type HomeProduct = {
    id: string;
    name: string;
    product_type: string;
    image_path: string | null;
    store_id: string | null;
    store: { name: string; slug: string };
  };

  const myStoreQuery = useQuery({
    queryKey: ["homepage-my-store", session?.user.id],
    enabled: !!session?.user.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,name,slug")
        .eq("owner_id", session!.user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const myStoreProductsQuery = useQuery({
    queryKey: ["homepage-my-store-products", myStoreQuery.data?.id],
    enabled: !!myStoreQuery.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,product_type,image_path,store_id")
        .eq("store_id", myStoreQuery.data!.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Omit<HomeProduct, "store">[];
    },
  });

  const latestProductsQuery = useQuery({
    queryKey: ["homepage-latest-products"],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,name,product_type,image_path,store_id")
        .eq("is_active", true)
        .not("store_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      const storeIds = [...new Set((products ?? []).map((product) => product.store_id).filter((id): id is string => !!id))];
      if (!storeIds.length) return [] as HomeProduct[];
      const { data: stores, error: storesError } = await supabase
        .from("stores")
        .select("id,name,slug")
        .in("id", storeIds)
        .eq("status", "active");
      if (storesError) throw storesError;
      const storeMap = new Map((stores ?? []).map((store) => [store.id, store]));
      return (products ?? [])
        .filter((product) => !!product.store_id && storeMap.has(product.store_id))
        .map((product) => ({
          ...product,
          store: storeMap.get(product.store_id!)!,
        })) as HomeProduct[];
    },
  });

  function renderProductCard(product: Omit<HomeProduct, "store"> | HomeProduct, storeName: string, storeSlug: string) {
    return (
      <article key={product.id} className="overflow-hidden rounded-xl border border-border bg-card">
        <Link to="/products/$id" params={{ id: product.id }} className="block">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream-light p-5">
            {product.image_path ? (
              <img
                src={supabase.storage.from("product-images").getPublicUrl(product.image_path).data.publicUrl}
                alt={product.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-3xl font-bold text-petrol/50">AB</span>
            )}
          </div>
        </Link>
        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">{t.marketplace[product.product_type as keyof typeof t.marketplace] ?? product.product_type}</p>
          <Link to="/products/$id" params={{ id: product.id }} className="block font-bold hover:text-coral">
            {product.name}
          </Link>
          <Link to="/stores/$slug" params={{ slug: storeSlug }} className="text-sm font-semibold text-coral hover:underline">
            {storeName}
          </Link>
        </div>
      </article>
    );
  }
  const accountLabel = session ? t.auth.account : t.auth.signIn;
  const links = [
    ["#home", t.nav.home],
    ["/catalog", t.marketplace.catalog],
    ["/seller", t.marketplace.sellerArea],
    ["#products", t.nav.products],
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
        <img src={banner.url} alt="Algorea Bazaar" className="block h-auto w-full" />

        <section id="home" className="bg-cream-light">
          <div className="mx-auto max-w-6xl px-4 py-16 text-center md:py-24">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">{t.heroKicker}</p>
            <h1 className="mx-auto mt-4 max-w-3xl text-3xl font-extrabold leading-tight md:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-muted-foreground md:text-lg">{t.heroText}</p>
            <a
              href="/catalog"
              className="mt-8 inline-flex rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-soft transition-transform hover:-translate-y-0.5"
            >
              {t.marketplace.viewCatalog}
            </a>
          </div>
        </section>

        <section id="my-store-products" aria-labelledby="my-store-products-title" className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2 id="my-store-products-title" className="text-xl font-bold text-petrol md:text-2xl">
                {t.marketplace.myLatestProducts}
              </h2>
              {myStoreQuery.data && (
                <Link to="/stores/$slug" params={{ slug: myStoreQuery.data.slug }} className="text-sm font-semibold text-coral hover:underline">
                  {t.marketplace.viewStore}
                </Link>
              )}
            </div>
            {!session ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {t.marketplace.signInForMyStore}
              </p>
            ) : myStoreQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.loading}</p>
            ) : myStoreQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.error}</p>
            ) : !myStoreQuery.data ? (
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <p className="text-sm text-muted-foreground">{t.marketplace.noStore}</p>
                <Link to="/seller" className="mt-3 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground">
                  {t.marketplace.createStore}
                </Link>
              </div>
            ) : myStoreProductsQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.loading}</p>
            ) : myStoreProductsQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.error}</p>
            ) : !myStoreProductsQuery.data?.length ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t.marketplace.noRecentProducts}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myStoreProductsQuery.data.map((product) => renderProductCard(product, myStoreQuery.data.name, myStoreQuery.data.slug))}
              </div>
            )}
          </div>
        </section>

        <section id="latest-products" aria-labelledby="latest-products-title" className="bg-cream-light">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="latest-products-title" className="mb-6 text-xl font-bold text-petrol md:text-2xl">
              {t.marketplace.latestMarketplaceProducts}
            </h2>
            {latestProductsQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.loading}</p>
            ) : latestProductsQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">{t.marketplace.error}</p>
            ) : !latestProductsQuery.data?.length ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">{t.marketplace.noRecentProducts}</p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestProductsQuery.data.map((product) => renderProductCard(product, product.store.name, product.store.slug))}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="cats" className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="cats" className="mb-5 text-center text-xl font-bold text-petrol">{t.marketplace.browseCategories}</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {CATEGORIES.map(([id, Icon]) => (
                <Link key={id} to="/catalog" search={{ type: id }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center text-sm font-semibold transition hover:-translate-y-0.5 hover:border-coral hover:text-coral">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-cream-light text-petrol"><Icon className="h-6 w-6" aria-hidden /></span>
                  {t.marketplace[id]}
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link to="/catalog" className="inline-flex rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground">
                {t.marketplace.viewCatalog}
              </Link>
            </div>
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
