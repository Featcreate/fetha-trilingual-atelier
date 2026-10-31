import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND, parseTNDToMillimes } from "@/lib/money";
import { AuthShell, SubmitButton } from "@/components/AuthShell";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    const { data: isAdmin, error: roleError } = await supabase.rpc("has_role", {
      _user_id: data.user.id,
      _role: "admin",
    });
    if (roleError || !isAdmin) throw redirect({ to: "/account" });
    return { user: data.user };
  },
  head: () => ({ meta: [{ title: "Administration — Algorea Bazaar" }, { name: "robots", content: "noindex,nofollow" }] }),
  component: AdminPage,
});

type StoreRow = { id: string; owner_id: string; name: string; slug: string; status: "active" | "suspended"; created_at: string };
type ProductRow = { id: string; store_id: string | null; name: string; product_type: string; price_millimes: number; is_active: boolean; created_at: string };
type OrderRow = { id: string; user_id: string; status: string; total_millimes: number; currency: string; created_at: string };

function AdminPage() {
  const { lang, setLang, t } = useLang();
  const a = t.admin;
  const qc = useQueryClient();
  const [commission, setCommission] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";

  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase.from("platform_settings").select("commission_bps,updated_at,updated_by").eq("id", true).single();
      if (error) throw error;
      return data;
    },
  });
  const stores = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id,owner_id,name,slug,status,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id,store_id,name,product_type,price_millimes,is_active,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select("id,user_id,status,total_millimes,currency,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });

  async function saveCommission(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = Number(commission);
    if (!commission.trim() || !Number.isFinite(value) || value < 0 || value > 100 || Math.round(value * 100) !== value * 100) {
      setNotice({ ok: false, text: a.invalidCommission }); return;
    }
    setBusy("commission"); setNotice(null);
    const { error } = await supabase.rpc("admin_set_commission_bps", { _bps: Math.round(value * 100) });
    setBusy(null);
    if (error) { setNotice({ ok: false, text: a.saveError }); return; }
    setNotice({ ok: true, text: a.saved });
    setCommission("");
    await qc.invalidateQueries({ queryKey: ["admin-settings"] });
    await qc.invalidateQueries({ queryKey: ["platform-commission"] });
  }

  async function setStoreStatus(store: StoreRow) {
    const status = store.status === "active" ? "suspended" : "active";
    setBusy(store.id); setNotice(null);
    const { error } = await supabase.from("stores").update({ status }).eq("id", store.id);
    setBusy(null);
    if (error) { setNotice({ ok: false, text: a.saveError }); return; }
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-stores"] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    await qc.invalidateQueries({ queryKey: ["product-detail"] });
  }

  async function setProductVisibility(product: ProductRow) {
    setBusy(product.id); setNotice(null);
    const { error } = await supabase.from("products").update({ is_active: !product.is_active }).eq("id", product.id);
    setBusy(null);
    if (error) { setNotice({ ok: false, text: a.saveError }); return; }
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-products"] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    await qc.invalidateQueries({ queryKey: ["product-detail"] });
  }

  const paidTotal = (orders.data ?? []).filter(o => o.status === "paid").reduce((sum, o) => sum + o.total_millimes, 0);
  const activeStores = (stores.data ?? []).filter(s => s.status === "active").length;
  const listedProducts = (products.data ?? []).filter(p => p.is_active).length;

  return (
    <AuthShell lang={lang} setLang={setLang} title={a.title} wide>
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link to="/seller" className="font-semibold text-coral hover:underline">{t.marketplace.sellerArea}</Link>
        <Link to="/catalog" className="font-semibold text-coral hover:underline">{t.marketplace.viewCatalog}</Link>
        <Link to="/orders" className="font-semibold text-coral hover:underline">{t.marketplace.myOrders}</Link>
      </div>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">{a.subtitle}</p>
      {notice && <p role={notice.ok ? "status" : "alert"} className={`mb-5 rounded-xl p-3 text-sm ${notice.ok ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}>{notice.text}</p>}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{a.stores}</p><p className="mt-1 text-2xl font-bold">{stores.data?.length ?? "—"}</p><p className="text-xs text-muted-foreground">{a.active}: {activeStores}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{a.products}</p><p className="mt-1 text-2xl font-bold">{products.data?.length ?? "—"}</p><p className="text-xs text-muted-foreground">{a.listed}: {listedProducts}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{a.orders}</p><p className="mt-1 text-2xl font-bold">{orders.data?.length ?? "—"}</p><p className="text-xs text-muted-foreground">{a.paidOrders}: {(orders.data ?? []).filter(o => o.status === "paid").length}</p></div>
        <div className="rounded-xl border border-border p-4"><p className="text-sm text-muted-foreground">{a.paidVolume}</p><p className="mt-1 text-2xl font-bold">{formatTND(paidTotal)}</p><p className="text-xs text-muted-foreground">{a.latest100}</p></div>
      </section>

      <section className="mb-8 rounded-xl border border-border p-5">
        <h2 className="text-lg font-bold">{a.commissionTitle}</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{a.commissionHelp}</p>
        {settings.isPending ? <p className="mt-4 text-sm">{a.loading}</p> : settings.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{a.loadError}</p> : (
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <p className="text-sm text-muted-foreground">{a.currentCommission}</p>
            <p className="mt-1 text-2xl font-extrabold">{settings.data.commission_bps === null ? a.notConfigured : `${(settings.data.commission_bps / 100).toFixed(2)}%`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{a.lastUpdated}: {new Date(settings.data.updated_at).toLocaleString(locale)}</p>
          </div>
        )}
        <form onSubmit={saveCommission} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-sm font-medium">{a.newCommission}
            <div className="mt-1 flex items-center gap-2"><input aria-label={a.newCommission} type="number" min="0" max="100" step="0.01" inputMode="decimal" value={commission} onChange={e => setCommission(e.target.value)} placeholder="0.00" className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base" /><span>%</span></div>
          </label>
          <SubmitButton busy={busy === "commission"} label={a.saveCommission} busyLabel={a.saving} />
        </form>
        <p className="mt-3 text-xs text-muted-foreground">{a.commissionWarning}</p>
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{a.storeModeration}</h2><span className="text-xs text-muted-foreground">{a.latest100}</span></div>
        {stores.isPending ? <p>{a.loading}</p> : stores.isError ? <p role="alert">{a.loadError}</p> : !stores.data.length ? <p className="rounded-xl bg-secondary p-4">{a.emptyStores}</p> : (
          <div className="space-y-3">{stores.data.map(store => <article key={store.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0"><p className="font-semibold">{store.name}</p><p className="text-xs text-muted-foreground" dir="ltr">/stores/{store.slug} · {store.owner_id.slice(0,8)}</p><p className="text-xs text-muted-foreground">{new Date(store.created_at).toLocaleDateString(locale)}</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-xs">{store.status === "active" ? a.active : a.suspended}</span><button type="button" disabled={busy === store.id} onClick={() => void setStoreStatus(store)} className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">{store.status === "active" ? a.suspend : a.reactivate}</button></div>
          </article>)}</div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{a.productModeration}</h2><span className="text-xs text-muted-foreground">{a.latest100}</span></div>
        {products.isPending ? <p>{a.loading}</p> : products.isError ? <p role="alert">{a.loadError}</p> : !products.data.length ? <p className="rounded-xl bg-secondary p-4">{a.emptyProducts}</p> : (
          <div className="space-y-3">{products.data.map(product => <article key={product.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div className="min-w-0"><p className="font-semibold">{product.name}</p><p className="text-xs text-muted-foreground">{product.product_type} · {formatTND(product.price_millimes)} · {product.store_id?.slice(0,8) ?? "—"}</p><p className="text-xs text-muted-foreground">{new Date(product.created_at).toLocaleDateString(locale)}</p></div>
            <div className="flex items-center gap-2"><span className="rounded-full bg-secondary px-3 py-1 text-xs">{product.is_active ? a.listed : a.hidden}</span><button type="button" disabled={busy === product.id} onClick={() => void setProductVisibility(product)} className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50">{product.is_active ? a.hide : a.list}</button></div>
          </article>)}</div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-bold">{a.orderMonitoring}</h2><span className="text-xs text-muted-foreground">{a.latest100}</span></div>
        {orders.isPending ? <p>{a.loading}</p> : orders.isError ? <p role="alert">{a.loadError}</p> : !orders.data.length ? <p className="rounded-xl bg-secondary p-4">{a.emptyOrders}</p> : (
          <div className="space-y-3">{orders.data.map(order => <article key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
            <div><p className="font-semibold">#{order.id.slice(0,8)}</p><p className="text-xs text-muted-foreground">{new Date(order.created_at).toLocaleString(locale)} · {a.customer}: {order.user_id.slice(0,8)}</p></div>
            <div className="text-end"><p className="font-bold">{formatTND(order.total_millimes)} {order.currency}</p><p className="text-xs text-muted-foreground">{order.status}</p></div>
          </article>)}</div>
        )}
      </section>
    </AuthShell>
  );
}
