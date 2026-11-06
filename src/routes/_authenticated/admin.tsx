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
    // Read the caller's own role row directly. The user_roles RLS policy
    // permits authenticated users to read their own role, and this avoids
    // a false-negative RPC result blocking the platform owner.
    const { data: role, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (roleError) throw roleError;
    if (role?.role !== "admin") throw redirect({ to: "/account" });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "Administration — Algorea Bazaar" },
      {
        name: "description",
        content: "Administration privée des boutiques et produits Algorea Bazaar.",
      },
      { property: "og:title", content: "Administration — Algorea Bazaar" },
      {
        property: "og:description",
        content: "Administration privée des boutiques et produits Algorea Bazaar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPage,
});

type StoreRow = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
};
type ProductRow = {
  id: string;
  store_id: string | null;
  name: string;
  product_type: string;
  price_millimes: number;
  is_active: boolean;
  created_at: string;
};
type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  total_millimes: number;
  currency: string;
  created_at: string;
};
type PayoutRow = {
  id: string;
  store_id: string;
  status: string;
  seller_amount_millimes: number;
  external_fees_millimes: number;
  gross_millimes: number;
  commission_millimes: number;
  discount_millimes: number;
  commission_bps: number;
  created_at: string;
  paid_at: string | null;
  provider_transfer_ref: string | null;
  failure_reason: string | null;
  payout_destination_method: string | null;
  payout_account_holder_name: string | null;
  payout_provider_name: string | null;
  payout_account_identifier: string | null;
  payout_bank_name: string | null;
  payout_additional_details: string | null;
};

function AdminPage() {
  const { lang, setLang, t } = useLang();
  const a = t.admin;
  const qc = useQueryClient();
  const [commission, setCommission] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [payoutStoreId, setPayoutStoreId] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutFailure, setPayoutFailure] = useState("");
  const [feeCategory, setFeeCategory] = useState("payment_processing");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeReference, setFeeReference] = useState("");
  const [feeDescription, setFeeDescription] = useState("");
  const [sharedFeeOrderId, setSharedFeeOrderId] = useState("");
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";

  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("commission_bps,updated_at,updated_by")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data;
    },
  });
  const stores = useQuery({
    queryKey: ["admin-stores"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stores")
        .select("id,owner_id,name,slug,status,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as StoreRow[];
    },
  });
  const products = useQuery({
    queryKey: ["admin-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,store_id,name,product_type,price_millimes,is_active,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });
  const orders = useQuery({
    queryKey: ["admin-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id,user_id,status,total_millimes,currency,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });
  const payouts = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_payouts")
        .select(
          "id,store_id,status,seller_amount_millimes,external_fees_millimes,gross_millimes,commission_millimes,discount_millimes,commission_bps,created_at,paid_at,provider_transfer_ref,failure_reason,payout_destination_method,payout_account_holder_name,payout_provider_name,payout_account_identifier,payout_bank_name,payout_additional_details",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as PayoutRow[];
    },
  });

  async function saveCommission(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const value = Number(commission);
    if (
      !commission.trim() ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      Math.round(value * 100) !== value * 100
    ) {
      setNotice({ ok: false, text: a.invalidCommission });
      return;
    }
    setBusy("commission");
    setNotice(null);
    const { error } = await supabase.rpc("admin_set_commission_bps", {
      _bps: Math.round(value * 100),
    });
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setNotice({ ok: true, text: a.saved });
    setCommission("");
    await qc.invalidateQueries({ queryKey: ["admin-settings"] });
    await qc.invalidateQueries({ queryKey: ["platform-commission"] });
  }

  async function createSellerPayout() {
    if (!payoutStoreId) return;
    setBusy("payout-create");
    setNotice(null);
    const { error } = await supabase.rpc("admin_create_seller_payout", {
      _store_id: payoutStoreId,
      _idempotency_key: `seller-payout:${payoutStoreId}:${crypto.randomUUID()}`,
    });
    setBusy(null);
    if (error) {
      setNotice({
        ok: false,
        text: error.message.includes("payout_destination_required")
          ? lang === "ar"
            ? "على البائع حفظ وسيلة الاستلام وبيانات الحساب قبل إنشاء الدفعة."
            : lang === "en"
              ? "The seller must save a receiving method and account details before a payout can be created."
              : "Le vendeur doit enregistrer un moyen de réception et ses coordonnées avant la création du versement."
          : error.message.includes("external_fees_exceed_available_seller_balance")
            ? lang === "ar"
              ? "الرسوم الخارجية المسجلة تتجاوز المستحقات المتاحة حالياً؛ ستبقى معلقة حتى تتوفر مبيعات كافية."
              : lang === "en"
                ? "Recorded external fees exceed the currently available seller balance; they remain outstanding until sufficient sales accrue."
                : "Les frais externes enregistrés dépassent le solde vendeur disponible ; ils restent en attente jusqu’à ce que les ventes soient suffisantes."
            : error.message.includes("no_unpaid_sales")
              ? lang === "ar"
                ? "لا توجد مبيعات مؤكدة غير مدفوعة لهذا المتجر."
                : lang === "en"
                  ? "No verified unpaid sales are available for this store."
                  : "Aucune vente vérifiée non réglée pour cette boutique."
              : a.saveError,
      });
      return;
    }
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  }

  async function recordSellerExternalFee(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!payoutStoreId && !sharedFeeOrderId.trim()) {
      setNotice({ ok: false, text: a.payoutStore });
      return;
    }
    const amount = parseTNDToMillimes(feeAmount);
    if (!amount || feeReference.trim().length < 3 || feeDescription.trim().length < 3) {
      setNotice({
        ok: false,
        text:
          lang === "ar"
            ? "أدخل مبلغاً صحيحاً ومرجعاً ووصفاً يثبت الرسوم الفعلية."
            : lang === "en"
              ? "Enter a valid amount, evidence reference and description for the actual fee."
              : "Saisissez un montant valide, une référence justificative et une description des frais réels.",
      });
      return;
    }

    setBusy("external-fee");
    setNotice(null);
    try {
      const isSharedOrderFee = Boolean(sharedFeeOrderId.trim());
      const { error } = isSharedOrderFee
        ? await supabase.rpc("admin_record_shared_seller_fee", {
            _order_id: sharedFeeOrderId.trim(),
            _fee_category: feeCategory,
            _amount_millimes: amount,
            _source: "verified_provider_or_bank_statement",
            _external_reference: feeReference.trim(),
            _description: feeDescription.trim(),
            _idempotency_key: `seller-shared-fee:${crypto.randomUUID()}`,
          })
        : await supabase.rpc("admin_record_seller_external_fee", {
            _store_id: payoutStoreId,
            _fee_category: feeCategory,
            _amount_millimes: amount,
            _source: "verified_provider_or_bank_statement",
            _external_reference: feeReference.trim(),
            _description: feeDescription.trim(),
            _idempotency_key: `seller-external-fee:${crypto.randomUUID()}`,
          });

      if (error) {
        const conflict =
          error.message.includes("business_reference_conflict") ||
          error.message.includes("idempotency_conflict");
        setNotice({
          ok: false,
          text: conflict
            ? lang === "ar"
              ? "مرجع الرسوم مستخدم سابقاً بمبلغ أو بيانات مختلفة. راجع كشف المزود قبل إعادة التسجيل."
              : lang === "en"
                ? "This fee reference was already used with different financial details. Check the provider statement before retrying."
                : "Cette référence de frais existe déjà avec des données financières différentes. Vérifiez le relevé avant de réessayer."
            : a.saveError,
        });
        return;
      }

      setFeeAmount("");
      setFeeReference("");
      setFeeDescription("");
      setSharedFeeOrderId("");
      setNotice({
        ok: true,
        text: isSharedOrderFee
          ? lang === "ar"
            ? "تم تسجيل الرسوم أو التحقق من تسجيلها سابقاً دون تكرار الخصم."
            : lang === "en"
              ? "The fee was recorded or matched to its previous record; no duplicate deduction was created."
              : "Les frais ont été enregistrés ou rapprochés de leur enregistrement précédent, sans double déduction."
          : lang === "ar"
            ? "تم تسجيل الرسوم الفعلية أو التحقق من تسجيلها سابقاً."
            : lang === "en"
              ? "The actual fee was recorded or matched to its previous record."
              : "Les frais réels ont été enregistrés ou rapprochés de leur enregistrement précédent.",
      });
      await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    } catch {
      setNotice({
        ok: false,
        text:
          lang === "ar"
            ? "تعذر تأكيد العملية. يمكنك إعادة المحاولة بنفس مرجع الإيصال؛ ستمنع قاعدة البيانات تكرار الخصم."
            : lang === "en"
              ? "The result could not be confirmed. Retry with the same receipt reference; the database will prevent a duplicate deduction."
              : "Le résultat n'a pas pu être confirmé. Réessayez avec la même référence de reçu ; la base de données empêchera un double débit.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function confirmSellerPayout(payoutId: string) {
    if (payoutReference.trim().length < 3) {
      setNotice({ ok: false, text: a.payoutReferenceRequired });
      return;
    }
    setBusy("payout-paid");
    setNotice(null);
    const { error } = await supabase.rpc("admin_mark_seller_payout_paid", {
      _payout_id: payoutId,
      _transfer_reference: payoutReference.trim(),
    });
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setPayoutReference("");
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  }

  async function failSellerPayout(payoutId: string) {
    if (payoutFailure.trim().length < 3) {
      setNotice({ ok: false, text: a.payoutFailureRequired });
      return;
    }
    setBusy(payoutId);
    setNotice(null);
    const { error } = await supabase.rpc("admin_mark_seller_payout_failed", {
      _payout_id: payoutId,
      _failure_reason: payoutFailure.trim(),
    });
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setPayoutFailure("");
    setNotice({ ok: true, text: a.payoutFailedNote });
    await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
  }

  async function setStoreStatus(store: StoreRow) {
    const status = store.status === "active" ? "suspended" : "active";
    setBusy(store.id);
    setNotice(null);
    const { error } = await supabase.from("stores").update({ status }).eq("id", store.id);
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-stores"] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    await qc.invalidateQueries({ queryKey: ["product-detail"] });
  }

  async function setProductVisibility(product: ProductRow) {
    setBusy(product.id);
    setNotice(null);
    const { error } = await supabase
      .from("products")
      .update({ is_active: !product.is_active })
      .eq("id", product.id);
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setNotice({ ok: true, text: a.saved });
    await qc.invalidateQueries({ queryKey: ["admin-products"] });
    await qc.invalidateQueries({ queryKey: ["catalog"] });
    await qc.invalidateQueries({ queryKey: ["product-detail"] });
  }

  const paidTotal = (orders.data ?? [])
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.total_millimes, 0);
  const activeStores = (stores.data ?? []).filter((s) => s.status === "active").length;
  const listedProducts = (products.data ?? []).filter((p) => p.is_active).length;

  return (
    <AuthShell lang={lang} setLang={setLang} title={a.title} wide>
      <div className="mb-6 flex flex-wrap gap-4 text-sm">
        <Link to="/seller" className="font-semibold text-coral hover:underline">
          {t.marketplace.sellerArea}
        </Link>
        <Link to="/catalog" className="font-semibold text-coral hover:underline">
          {t.marketplace.viewCatalog}
        </Link>
        <Link to="/orders" className="font-semibold text-coral hover:underline">
          {t.marketplace.myOrders}
        </Link>
      </div>
      <p className="mb-6 text-sm leading-7 text-muted-foreground">{a.subtitle}</p>
      {notice && (
        <p
          role={notice.ok ? "status" : "alert"}
          className={`mb-5 rounded-xl p-3 text-sm ${notice.ok ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}
        >
          {notice.text}
        </p>
      )}

      <section className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{a.stores}</p>
          <p className="mt-1 text-2xl font-bold">{stores.data?.length ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {a.active}: {activeStores}
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{a.products}</p>
          <p className="mt-1 text-2xl font-bold">{products.data?.length ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {a.listed}: {listedProducts}
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{a.orders}</p>
          <p className="mt-1 text-2xl font-bold">{orders.data?.length ?? "—"}</p>
          <p className="text-xs text-muted-foreground">
            {a.paidOrders}: {(orders.data ?? []).filter((o) => o.status === "paid").length}
          </p>
        </div>
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">{a.paidVolume}</p>
          <p className="mt-1 text-2xl font-bold">{formatTND(paidTotal)}</p>
          <p className="text-xs text-muted-foreground">{a.latest100}</p>
        </div>
      </section>

      <section className="mb-8 rounded-xl border border-border p-5">
        <h2 className="text-lg font-bold">{a.commissionTitle}</h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">{a.commissionHelp}</p>
        {settings.isPending ? (
          <p className="mt-4 text-sm">{a.loading}</p>
        ) : settings.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {a.loadError}
          </p>
        ) : (
          <div className="mt-4 rounded-lg bg-secondary p-4">
            <p className="text-sm text-muted-foreground">{a.currentCommission}</p>
            <p className="mt-1 text-2xl font-extrabold">
              {settings.data.commission_bps === null
                ? a.notConfigured
                : `${(settings.data.commission_bps / 100).toFixed(2)}%`}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {a.lastUpdated}: {new Date(settings.data.updated_at).toLocaleString(locale)}
            </p>
          </div>
        )}
        <form onSubmit={saveCommission} className="mt-4 flex flex-wrap items-end gap-3">
          <label className="min-w-[180px] flex-1 text-sm font-medium">
            {a.newCommission}
            <div className="mt-1 flex items-center gap-2">
              <input
                aria-label={a.newCommission}
                type="number"
                min="0"
                max="100"
                step="0.01"
                inputMode="decimal"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="0.00"
                className="h-11 w-full rounded-lg border border-input bg-background px-3 text-base"
              />
              <span>%</span>
            </div>
          </label>
          <SubmitButton
            busy={busy === "commission"}
            label={a.saveCommission}
            busyLabel={a.saving}
          />
        </form>
        <p className="mt-3 text-xs text-muted-foreground">{a.commissionWarning}</p>
      </section>

      <section className="mb-8 rounded-xl border border-border p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{a.payouts}</h2>
          <span className="text-xs text-muted-foreground">{a.payoutConfirmNote}</span>
        </div>
        <div className="flex flex-wrap gap-3">
          <select
            value={payoutStoreId}
            onChange={(e) => setPayoutStoreId(e.target.value)}
            className="min-w-[220px] flex-1 rounded-lg border border-input bg-background px-3 py-2"
          >
            <option value="">{a.payoutStore}</option>
            {(stores.data ?? []).map((store) => (
              <option key={store.id} value={store.id}>
                {store.name} · {store.slug}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy === "payout-create" || !payoutStoreId}
            onClick={() => void createSellerPayout()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "payout-create" ? a.saving : a.createPayout}
          </button>
        </div>
        <div className="mb-4 rounded-lg border border-border p-4">
          <h3 className="font-semibold">
            {lang === "ar"
              ? "تسجيل رسوم خارجية فعلية"
              : lang === "en"
                ? "Record an actual external fee"
                : "Enregistrer des frais externes réels"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "لا تسجل إلا الرسوم المثبتة فعلياً. للتوزيع التلقائي بالتناسب على البائعين المرتبطين بطلب مدفوع، أدخل رقم الطلب في الحقل الاختياري. وإلا اختر متجر البائع لتسجيل رسومه وحده."
              : lang === "en"
                ? "Record only fees supported by an actual statement or receipt. To allocate a fee proportionally across sellers on a verified paid order, enter the optional order ID. Otherwise select one store to record a seller-specific fee."
                : "Enregistrez uniquement les frais justifiés par un relevé ou reçu réel. Pour répartir automatiquement des frais au prorata entre les vendeurs d’une commande payée et vérifiée, saisissez l’ID de commande facultatif. Sinon, sélectionnez une boutique pour enregistrer les frais d’un seul vendeur."}
          </p>
          <form onSubmit={recordSellerExternalFee} className="mt-3 grid gap-2 sm:grid-cols-2">
            <select
              value={feeCategory}
              onChange={(e) => setFeeCategory(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-2"
            >
              <option value="payment_processing">
                {lang === "ar"
                  ? "معالجة الدفع"
                  : lang === "en"
                    ? "Payment processing"
                    : "Traitement du paiement"}
              </option>
              <option value="payment_collection">
                {lang === "ar"
                  ? "تحصيل الدفع"
                  : lang === "en"
                    ? "Payment collection"
                    : "Encaissement"}
              </option>
              <option value="currency_conversion">
                {lang === "ar"
                  ? "تحويل العملة"
                  : lang === "en"
                    ? "Currency conversion"
                    : "Conversion de devise"}
              </option>
              <option value="provider_settlement">
                {lang === "ar"
                  ? "تسوية المزود"
                  : lang === "en"
                    ? "Provider settlement"
                    : "Règlement prestataire"}
              </option>
              <option value="seller_transfer">
                {lang === "ar"
                  ? "تحويل مستحقات البائع"
                  : lang === "en"
                    ? "Seller transfer"
                    : "Virement vendeur"}
              </option>
              <option value="receiving">
                {lang === "ar"
                  ? "رسوم الاستلام"
                  : lang === "en"
                    ? "Receiving fee"
                    : "Frais de réception"}
              </option>
              <option value="withdrawal">
                {lang === "ar" ? "السحب" : lang === "en" ? "Withdrawal" : "Retrait"}
              </option>
              <option value="other">
                {lang === "ar" ? "أخرى" : lang === "en" ? "Other" : "Autres"}
              </option>
            </select>
            <input
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "المبلغ بالدينار التونسي"
                  : lang === "en"
                    ? "Amount in TND"
                    : "Montant en TND"
              }
              className="rounded-lg border border-input bg-background px-3 py-2"
            />
            <input
              value={feeReference}
              onChange={(e) => setFeeReference(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "مرجع الإيصال أو كشف المزود"
                  : lang === "en"
                    ? "Statement / receipt reference"
                    : "Référence du relevé / reçu"
              }
              className="rounded-lg border border-input bg-background px-3 py-2"
            />
            <input
              value={sharedFeeOrderId}
              onChange={(e) => setSharedFeeOrderId(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "رقم الطلب (اختياري لتوزيع الرسوم بالتناسب)"
                  : lang === "en"
                    ? "Order ID (optional: allocate proportionally)"
                    : "ID de commande (facultatif : répartition proportionnelle)"
              }
              className="rounded-lg border border-input bg-background px-3 py-2 sm:col-span-2"
            />
            <input
              value={feeDescription}
              onChange={(e) => setFeeDescription(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "وصف الرسوم"
                  : lang === "en"
                    ? "Fee description"
                    : "Description des frais"
              }
              className="rounded-lg border border-input bg-background px-3 py-2"
            />
            <button
              type="submit"
              disabled={busy === "external-fee" || (!payoutStoreId && !sharedFeeOrderId.trim())}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50 sm:col-span-2"
            >
              {busy === "external-fee"
                ? a.saving
                : sharedFeeOrderId.trim()
                  ? lang === "ar"
                    ? "توزيع الرسوم على بائعي الطلب"
                    : lang === "en"
                      ? "Allocate fee across order sellers"
                      : "Répartir les frais entre les vendeurs de la commande"
                  : lang === "ar"
                    ? "تسجيل الرسوم على البائع المحدد"
                    : lang === "en"
                      ? "Record fee against selected seller"
                      : "Imputer les frais au vendeur sélectionné"}
            </button>
          </form>
        </div>
        {payouts.isPending ? (
          <p className="mt-4 text-sm">{a.loading}</p>
        ) : payouts.isError ? (
          <p role="alert" className="mt-4 text-sm text-destructive">
            {a.loadError}
          </p>
        ) : !payouts.data.length ? (
          <p className="mt-4 rounded-lg bg-secondary p-4 text-sm">{a.noPayouts}</p>
        ) : (
          <div className="mt-4 space-y-3">
            {payouts.data.map((payout) => (
              <article key={payout.id} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {stores.data?.find((s) => s.id === payout.store_id)?.name ?? payout.store_id}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {payout.status} · {new Date(payout.created_at).toLocaleDateString(locale)} ·{" "}
                      {(payout.commission_bps / 100).toFixed(2)}% ·{" "}
                      {lang === "ar"
                        ? "متوسط مرجّح"
                        : lang === "en"
                          ? "weighted average"
                          : "moyenne pondérée"}
                    </p>
                    {payout.provider_transfer_ref && (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {payout.provider_transfer_ref}
                      </p>
                    )}
                    {payout.payout_destination_method && (
                      <div className="mt-2 rounded-lg bg-secondary/60 p-3 text-xs leading-6">
                        <p className="font-semibold">
                          {lang === "ar"
                            ? "وجهة التحويل المحفوظة لهذه الدفعة"
                            : lang === "en"
                              ? "Destination saved for this payout"
                              : "Destination enregistrée pour ce versement"}
                        </p>
                        <p>
                          {payout.payout_destination_method} · {payout.payout_account_holder_name}
                        </p>
                        {payout.payout_provider_name && <p>{payout.payout_provider_name}</p>}
                        <p dir="ltr">{payout.payout_account_identifier}</p>
                        {payout.payout_bank_name && <p>{payout.payout_bank_name}</p>}
                        {payout.payout_additional_details && (
                          <p>{payout.payout_additional_details}</p>
                        )}
                      </div>
                    )}
                    {payout.failure_reason && (
                      <p className="text-xs text-destructive">{payout.failure_reason}</p>
                    )}
                  </div>
                  <div className="text-end">
                    <p className="font-bold">{formatTND(payout.seller_amount_millimes)}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.payoutGross}: {formatTND(payout.gross_millimes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {a.payoutCommission}: {formatTND(payout.commission_millimes)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {lang === "ar"
                        ? "الرسوم الخارجية على البائع"
                        : lang === "en"
                          ? "Seller external fees"
                          : "Frais externes vendeur"}
                      : {formatTND(payout.external_fees_millimes)}
                    </p>
                  </div>
                </div>
                {payout.status !== "paid" && payout.status !== "cancelled" && (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={payoutReference}
                      onChange={(e) => setPayoutReference(e.target.value)}
                      placeholder={a.payoutReferenceRequired}
                      maxLength={200}
                      className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    />
                    <button
                      type="button"
                      disabled={busy === payout.id}
                      onClick={() => void confirmSellerPayout(payout.id)}
                      className="rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    >
                      {a.markPayoutPaid}
                    </button>
                    {payout.status !== "failed" && (
                      <>
                        <input
                          value={payoutFailure}
                          onChange={(e) => setPayoutFailure(e.target.value)}
                          placeholder={a.payoutFailureRequired}
                          maxLength={500}
                          className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                        />
                        <button
                          type="button"
                          disabled={busy === payout.id}
                          onClick={() => void failSellerPayout(payout.id)}
                          className="rounded-full border border-destructive/40 px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
                        >
                          {a.markPayoutFailed}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{a.storeModeration}</h2>
          <span className="text-xs text-muted-foreground">{a.latest100}</span>
        </div>
        {stores.isPending ? (
          <p>{a.loading}</p>
        ) : stores.isError ? (
          <p role="alert">{a.loadError}</p>
        ) : !stores.data.length ? (
          <p className="rounded-xl bg-secondary p-4">{a.emptyStores}</p>
        ) : (
          <div className="space-y-3">
            {stores.data.map((store) => (
              <article
                key={store.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{store.name}</p>
                  <p className="text-xs text-muted-foreground" dir="ltr">
                    /stores/{store.slug} · {store.owner_id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(store.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                    {store.status === "active" ? a.active : a.suspended}
                  </span>
                  <button
                    type="button"
                    disabled={busy === store.id}
                    onClick={() => void setStoreStatus(store)}
                    className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {store.status === "active" ? a.suspend : a.reactivate}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{a.productModeration}</h2>
          <span className="text-xs text-muted-foreground">{a.latest100}</span>
        </div>
        {products.isPending ? (
          <p>{a.loading}</p>
        ) : products.isError ? (
          <p role="alert">{a.loadError}</p>
        ) : !products.data.length ? (
          <p className="rounded-xl bg-secondary p-4">{a.emptyProducts}</p>
        ) : (
          <div className="space-y-3">
            {products.data.map((product) => (
              <article
                key={product.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {product.product_type} · {formatTND(product.price_millimes)} ·{" "}
                    {product.store_id?.slice(0, 8) ?? "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(product.created_at).toLocaleDateString(locale)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs">
                    {product.is_active ? a.listed : a.hidden}
                  </span>
                  <button
                    type="button"
                    disabled={busy === product.id}
                    onClick={() => void setProductVisibility(product)}
                    className="rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                  >
                    {product.is_active ? a.hide : a.list}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">{a.orderMonitoring}</h2>
          <span className="text-xs text-muted-foreground">{a.latest100}</span>
        </div>
        {orders.isPending ? (
          <p>{a.loading}</p>
        ) : orders.isError ? (
          <p role="alert">{a.loadError}</p>
        ) : !orders.data.length ? (
          <p className="rounded-xl bg-secondary p-4">{a.emptyOrders}</p>
        ) : (
          <div className="space-y-3">
            {orders.data.map((order) => (
              <article
                key={order.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4"
              >
                <div>
                  <p className="font-semibold">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleString(locale)} · {a.customer}:{" "}
                    {order.user_id.slice(0, 8)}
                  </p>
                </div>
                <div className="text-end">
                  <p className="font-bold">
                    {formatTND(order.total_millimes)} {order.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">{order.status}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AuthShell>
  );
}
