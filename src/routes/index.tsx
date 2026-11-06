import { createFileRoute, Link } from "@tanstack/react-router";
import { User } from "lucide-react";
import { useSession } from "@/hooks/use-session";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatTND } from "@/lib/money";
import { TndEquivalents } from "@/components/TndEquivalents";
import { ProductPreview } from "@/components/ProductPreview";
import {
  Menu,
  X,
  BookOpen,
  FileText,
  LayoutTemplate,
  Layers,
  Printer,
  ClipboardList,
  CalendarCheck,
  GraduationCap,
  Gift,
  Laptop,
  Smartphone,
  Presentation,
  Package,
  Headphones,
  Video,
  Palette,
} from "lucide-react";

import { PRODUCT_TYPES } from "@/lib/product-types";
const categoryIcons = {
  ebook: BookOpen,
  pdf: FileText,
  template: LayoutTemplate,
  educational: GraduationCap,
  bundle: Gift,
  software: Laptop,
  app: Smartphone,
  printable: Printer,
  planner: CalendarCheck,
  course: Presentation,
  worksheets: ClipboardList,
  flashcards: Layers,
  audio: Headphones,
  video: Video,
  graphics: Palette,
  other: Package,
};
const categoryColors = [
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-sky-100 text-sky-700 border-sky-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-orange-100 text-orange-700 border-orange-200",
  "bg-lime-100 text-lime-700 border-lime-200",
  "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
  "bg-teal-100 text-teal-700 border-teal-200",
  "bg-pink-100 text-pink-700 border-pink-200",
  "bg-purple-100 text-purple-700 border-purple-200",
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "bg-stone-100 text-stone-700 border-stone-200",
];
const CATEGORIES = PRODUCT_TYPES.map(
  (id, index) => [id, categoryIcons[id], categoryColors[index % categoryColors.length]] as const,
);
import { BrandLogo } from "@/components/BrandLogo";
import heroBanner from "@/assets/1793464236433.jpg";
import { LANGS, dict, useLang } from "@/lib/i18n";
import { localizedProductText } from "@/lib/product-translations";

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
  type HomeProduct = {
    id: string;
    name: string;
    name_translations: unknown;
    product_type: string;
    price_millimes: number;
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
        .select("id,name,slug,banner_path")
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
        .select("id,name,name_translations,product_type,price_millimes,image_path,store_id")
        .eq("store_id", myStoreQuery.data!.id)
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return (data ?? []) as Omit<HomeProduct, "store">[];
    },
  });

  const myStoreBannerUrl = myStoreQuery.data?.banner_path
    ? supabase.storage.from("store-assets").getPublicUrl(myStoreQuery.data.banner_path).data.publicUrl
    : null;

  const latestProductsQuery = useQuery({
    queryKey: ["homepage-latest-products"],
    queryFn: async () => {
      const { data: products, error } = await supabase
        .from("products")
        .select("id,name,name_translations,product_type,price_millimes,image_path,store_id")
        .eq("is_active", true)
        .not("store_id", "is", null)
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      const storeIds = [
        ...new Set(
          (products ?? []).map((product) => product.store_id).filter((id): id is string => !!id),
        ),
      ];
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

  function renderProductCard(
    product: Omit<HomeProduct, "store"> | HomeProduct,
    storeName: string,
    storeSlug: string,
  ) {
    return (
      <article key={product.id} className="overflow-hidden rounded-xl border border-border bg-card">
        <Link to="/products/$id" params={{ id: product.id }} className="block">
          <div className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-cream-light p-5">
            <ProductPreview
              path={product.image_path}
              alt={localizedProductText(product.name, product.name_translations, lang)}
              className="h-full w-full object-cover"
            />
          </div>
        </Link>
        <div className="space-y-2 p-4">
          <p className="text-xs text-muted-foreground">
            {t.marketplace[product.product_type as keyof typeof t.marketplace] ??
              product.product_type}
          </p>
          <Link
            to="/products/$id"
            params={{ id: product.id }}
            className="block font-bold hover:text-coral"
          >
            {localizedProductText(product.name, product.name_translations, lang)}
          </Link>
          <p className="mt-2 font-bold">
            {formatTND(product.price_millimes)}
            <TndEquivalents
              millimes={product.price_millimes}
              locale={lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR"}
            />
          </p>
          <Link
            to="/stores/$slug"
            params={{ slug: storeSlug }}
            className="text-sm font-semibold text-coral hover:underline"
          >
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
          className={`rounded-full px-2 py-1 text-xs font-bold uppercase transition-colors sm:px-3 ${
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
        <section id="home" className="bg-cream-light">
          {/* Show the complete banner image first, followed by the translated headline and actions. */}
          <div className="relative">
            <img src={heroBanner} alt="" aria-hidden="true" className="block w-full" />
          </div>
          <div dir="ltr" className="flex w-full min-w-0 items-center gap-2 px-2 py-3 sm:gap-3 sm:px-4">
            <a href="#home" aria-label="Algorea Bazaar" className="flex h-12 w-20 shrink-0 md:h-14 md:w-36">
              <BrandLogo slotLabel={t.logoSlot} className="h-full w-full" />
            </a>
            <Link
              to={session ? "/account" : "/auth"}
              aria-label={accountLabel}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card p-2 hover:text-coral"
            >
              <User className="h-5 w-5" />
            </Link>
            <button
              className="shrink-0 rounded-md border border-border bg-card p-2 md:hidden"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-label={t.menu}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="ml-auto">{switcher}</div>
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
          <div dir={lang === "ar" ? "rtl" : "ltr"} className="mx-auto max-w-6xl px-4 py-7 text-start md:py-10">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-gold">
              {t.heroKicker}
            </p>
            <h1 className="mt-3 text-3xl font-extrabold leading-tight lg:text-5xl">
              {t.heroTitle}
            </h1>
            <p className="mt-4 max-w-3xl text-muted-foreground lg:mt-5 lg:text-lg">{t.heroText}</p>
            <div className="mt-6 flex flex-wrap gap-3 lg:mt-8">
              <Link
                to="/catalog"
                className="inline-flex rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-soft transition-transform hover:-translate-y-0.5"
              >
                {t.marketplace.viewCatalog}
              </Link>
              <Link
                to="/seller"
                className="inline-flex rounded-full border-2 border-petrol px-6 py-3 font-semibold text-petrol transition-colors hover:bg-petrol hover:text-cream"
              >
                {t.marketplace.startSelling}
              </Link>
            </div>
          </div>
        </section>

      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20">
          <nav className="hidden items-center gap-7 md:flex">
            {links.map(([href, label]) => (
              <a key={href} href={href} className="text-sm font-medium hover:text-coral">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {session && (
              <Link
                to="/orders"
                className="hidden text-sm font-semibold text-coral hover:underline lg:inline"
              >
                {t.marketplace.myOrders}
              </Link>
            )}
          </div>
        </div>
      </header>

      <main>


        <section
          id="my-store-products"
          aria-labelledby="my-store-products-title"
          className="bg-background"
        >
          <div className="mx-auto max-w-6xl px-4 py-10">
            {myStoreBannerUrl && (
              <img
                src={myStoreBannerUrl}
                alt={myStoreQuery.data?.name ?? "Store banner"}
                className="mb-6 max-h-56 w-full rounded-2xl border border-border object-cover sm:max-h-72"
              />
            )}
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <h2
                id="my-store-products-title"
                className="text-xl font-bold text-petrol md:text-2xl"
              >
                {t.marketplace.myLatestProducts}
              </h2>
              {myStoreQuery.data && (
                <Link
                  to="/stores/$slug"
                  params={{ slug: myStoreQuery.data.slug }}
                  className="text-sm font-semibold text-coral hover:underline"
                >
                  {t.marketplace.viewStore}
                </Link>
              )}
            </div>
            {!session ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {t.marketplace.signInForMyStore}
              </p>
            ) : myStoreQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.loading}
              </p>
            ) : myStoreQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.error}
              </p>
            ) : !myStoreQuery.data ? (
              <div className="rounded-xl border border-border bg-card p-5 text-center">
                <p className="text-sm text-muted-foreground">{t.marketplace.noStore}</p>
                <Link
                  to="/seller"
                  className="mt-3 inline-flex rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground"
                >
                  {t.marketplace.createStore}
                </Link>
              </div>
            ) : myStoreProductsQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.loading}
              </p>
            ) : myStoreProductsQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.error}
              </p>
            ) : !myStoreProductsQuery.data?.length ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {t.marketplace.noRecentProducts}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {myStoreProductsQuery.data.map((product) =>
                  renderProductCard(product, myStoreQuery.data!.name, myStoreQuery.data!.slug),
                )}
              </div>
            )}
          </div>
        </section>

        <section
          id="latest-products"
          aria-labelledby="latest-products-title"
          className="bg-cream-light"
        >
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2
              id="latest-products-title"
              className="mb-6 text-xl font-bold text-petrol md:text-2xl"
            >
              {t.marketplace.latestMarketplaceProducts}
            </h2>
            {latestProductsQuery.isPending ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.loading}
              </p>
            ) : latestProductsQuery.isError ? (
              <p role="alert" className="py-6 text-center text-sm text-muted-foreground">
                {t.marketplace.error}
              </p>
            ) : !latestProductsQuery.data?.length ? (
              <p className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
                {t.marketplace.noRecentProducts}
              </p>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {latestProductsQuery.data.map((product) =>
                  renderProductCard(product, product.store.name, product.store.slug),
                )}
              </div>
            )}
          </div>
        </section>

        <section aria-labelledby="cats" className="bg-background">
          <div className="mx-auto max-w-6xl px-4 py-10">
            <h2 id="cats" className="mb-5 text-center text-xl font-bold text-petrol">
              {t.marketplace.browseCategories}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {CATEGORIES.map(([id, Icon, colorClass]) => (
                <Link
                  key={id}
                  to="/catalog"
                  search={{ type: id }}
                  className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card p-5 text-center text-sm font-semibold transition duration-200 hover:-translate-y-1 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-coral"
                >
                  <span
                    className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${colorClass}`}
                  >
                    <Icon className="h-7 w-7" aria-hidden />
                  </span>
                  <span>{t.marketplace[id]}</span>
                </Link>
              ))}
            </div>
            <div className="mt-8 text-center">
              <Link
                to="/catalog"
                className="inline-flex rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground"
              >
                {t.marketplace.viewCatalog}
              </Link>
            </div>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              {t.marketplace.tndNote}
            </p>
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
