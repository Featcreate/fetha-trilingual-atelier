import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";
import { formatTND } from "@/lib/money";
import { getProductTypeLabel, getSubcategoryLabel } from "@/lib/product-categories";
import { AuthShell, SubmitButton } from "@/components/AuthShell";
import { adminRecheckIpayPayment } from "@/lib/shop.functions";
import {
  adminCreateSellerPayout,
  adminRecordSellerExternalFee,
  adminMarkSellerPayoutFailed,
  adminMarkSellerPayoutPaid,
  adminSetCommission,
  adminSetIpayCheckoutEnabled,
} from "@/lib/admin-security.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { redirect: location.href } });
    // Restrict the administration route to the verified platform-owner account.
    // Database RLS policies continue to enforce admin privileges for protected data/actions.
    if (data.user.email?.toLowerCase() !== "fathiaivy@gmail.com") {
      throw redirect({ to: "/account" });
    }
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
  product_subcategory: string | null;
  price_millimes: number;
  sale_price_millimes: number | null;
  is_active: boolean;
  created_at: string;
};
type OrderRow = {
  id: string;
  user_id: string;
  status: string;
  total_millimes: number;
  currency: string;
  ipay_payment_ref: string | null;
  konnect_payment_ref: string | null;
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
};

type FinancialLedgerRow = {
  entry_type: string;
  entry_side: string;
  accounting_amount_millimes: number;
  accounting_currency: string;
  store_id: string | null;
  created_at: string;
};
type VerifiedProviderOrderRow = {
  total_millimes: number;
  currency: string;
  ipay_payment_ref: string | null;
  konnect_payment_ref: string | null;
};
type PayoutBalanceRow = {
  store_id: string;
  status: string;
  seller_amount_millimes: number;
};

function AdminPage() {
  const { lang, setLang, t } = useLang();
  const a = t.admin;
  const qc = useQueryClient();
  const [commission, setCommission] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [recheckingOrderId, setRecheckingOrderId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [payoutStoreId, setPayoutStoreId] = useState("");
  const [payoutReference, setPayoutReference] = useState("");
  const [payoutFailure, setPayoutFailure] = useState("");
  const [feeClass, setFeeClass] = useState("digital_other_bank");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeReference, setFeeReference] = useState("");
  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";

  const settings = useQuery({
    queryKey: ["admin-settings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("commission_bps,ipay_checkout_enabled,updated_at,updated_by")
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
        .select(
          "id,store_id,name,product_type,product_subcategory,price_millimes,sale_price_millimes,is_active,created_at",
        )
        .is("deleted_at", null)
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
        .select(
          "id,user_id,status,total_millimes,currency,ipay_payment_ref,konnect_payment_ref,created_at",
        )
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as OrderRow[];
    },
  });
  const financialLedger = useQuery({
    queryKey: ["admin-financial-ledger"],
    queryFn: async () => {
      const rows: FinancialLedgerRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("platform_financial_ledger_entries")
          .select(
            "entry_type,entry_side,accounting_amount_millimes,accounting_currency,store_id,created_at",
          )
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as FinancialLedgerRow[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
  });
  const verifiedProviderOrders = useQuery({
    queryKey: ["admin-verified-provider-orders"],
    queryFn: async () => {
      const rows: VerifiedProviderOrderRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("orders")
          .select("total_millimes,currency,ipay_payment_ref,konnect_payment_ref")
          .eq("status", "paid")
          .eq("payment_mode", "verified")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as VerifiedProviderOrderRow[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
  });
  const payoutBalanceRows = useQuery({
    queryKey: ["admin-payout-balance-rows"],
    queryFn: async () => {
      const rows: PayoutBalanceRow[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("seller_payouts")
          .select("store_id,status,seller_amount_millimes")
          .neq("status", "cancelled")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = (data ?? []) as PayoutBalanceRow[];
        rows.push(...page);
        if (page.length < pageSize) return rows;
      }
    },
  });
  const unallocatedSellerTransferFees = useQuery({
    queryKey: ["admin-unallocated-seller-transfer-fees"],
    queryFn: async () => {
      const feeRows: Array<{ id: string; store_id: string; amount_millimes: number }> = [];
      const allocationRows: Array<{ fee_entry_id: string; amount_millimes: number }> = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("seller_external_fee_entries")
          .select("id,store_id,amount_millimes")
          .eq("fee_category", "seller_transfer")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data ?? [];
        feeRows.push(...page);
        if (page.length < pageSize) break;
      }
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("seller_payout_fee_allocations")
          .select("fee_entry_id,amount_millimes")
          .order("created_at", { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const page = data ?? [];
        allocationRows.push(...page);
        if (page.length < pageSize) break;
      }
      const allocatedByFee = new Map<string, number>();
      for (const allocation of allocationRows) {
        allocatedByFee.set(
          allocation.fee_entry_id,
          (allocatedByFee.get(allocation.fee_entry_id) ?? 0) + Number(allocation.amount_millimes),
        );
      }
      const byStore: Record<string, number> = {};
      for (const fee of feeRows) {
        const remaining = Math.max(
          0,
          Number(fee.amount_millimes) - (allocatedByFee.get(fee.id) ?? 0),
        );
        byStore[fee.store_id] = (byStore[fee.store_id] ?? 0) + remaining;
      }
      return byStore;
    },
  });
  const payouts = useQuery({
    queryKey: ["admin-payouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seller_payouts")
        .select(
          "id,store_id,status,seller_amount_millimes,external_fees_millimes,gross_millimes,commission_millimes,discount_millimes,commission_bps,created_at,paid_at,provider_transfer_ref,failure_reason",
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
    const { error } = await adminSetCommission({ data: { bps: Math.round(value * 100) } });
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

  async function setIpayCheckoutEnabled(enabled: boolean) {
    setBusy("ipay-switch");
    setNotice(null);
    const { error } = await adminSetIpayCheckoutEnabled({ data: { enabled } });
    setBusy(null);
    if (error) {
      setNotice({ ok: false, text: a.saveError });
      return;
    }
    setNotice({
      ok: true,
      text:
        lang === "ar"
          ? enabled
            ? "تم تشغيل مفتاح iPay الإداري. يظل مفتاح الخادم المستقل مطلوباً."
            : "تم إيقاف الدفع عبر iPay."
          : lang === "en"
            ? enabled
              ? "The iPay admin switch is on. The independent server gate is still required."
              : "iPay checkout has been switched off."
            : enabled
              ? "Le commutateur iPay est activé. La validation serveur indépendante reste obligatoire."
              : "Le paiement iPay est désactivé.",
    });
    await qc.invalidateQueries({ queryKey: ["admin-settings"] });
    await qc.invalidateQueries({ queryKey: ["cart-checkout-availability"] });
  }

  async function createSellerPayout() {
    if (!payoutStoreId) return;
    const selectedBalance = sellerBalances.get(payoutStoreId);
    const available = selectedBalance
      ? Math.max(
          0,
          selectedBalance.earned -
            selectedBalance.transferred -
            selectedBalance.reserved -
            (unallocatedSellerTransferFees.data?.[payoutStoreId] ?? 0),
        )
      : 0;
    if (available < 50_000) {
      setNotice({ ok: false, text: a.payoutMinimumNotMet });
      return;
    }
    setBusy("payout-create");
    setNotice(null);
    const { error } = await adminCreateSellerPayout({
      data: {
        storeId: payoutStoreId,
        idempotencyKey: `seller-payout:${payoutStoreId}:${crypto.randomUUID()}`,
      },
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
          : error.message.includes("payout_minimum_not_met")
            ? a.payoutMinimumNotMet
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
    await qc.invalidateQueries({ queryKey: ["admin-unallocated-seller-transfer-fees"] });
  }

  async function recordSellerTransferFee() {
    if (!payoutStoreId || !feeAmount.trim() || !feeReference.trim()) return;
    const amount = Number(feeAmount);
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 1000) !== amount * 1000) {
      setNotice({
        ok: false,
        text:
          lang === "ar"
            ? "أدخلي مبلغًا صحيحًا بثلاث خانات عشرية كحد أقصى."
            : lang === "en"
              ? "Enter a valid amount with up to three decimal places."
              : "Saisissez un montant valide avec trois décimales au maximum.",
      });
      return;
    }
    setBusy("payout-fee");
    setNotice(null);
    const { error } = await adminRecordSellerExternalFee({
      data: {
        storeId: payoutStoreId,
        amountMillimes: Math.round(amount * 1000),
        transferClass: feeClass as
          | "digital_same_bank"
          | "digital_other_bank"
          | "branch_same_bank"
          | "branch_other_bank"
          | "manual_list_same_bank"
          | "manual_list_other_bank",
        externalReference: feeReference.trim(),
      },
    });
    setBusy(null);
    if (error) {
      setNotice({
        ok: false,
        text: error.message.includes("forbidden") ? "forbidden" : a.saveError,
      });
      return;
    }
    setFeeAmount("");
    setFeeReference("");
    setNotice({
      ok: true,
      text:
        lang === "ar"
          ? "تم تسجيل الرسم الفعلي الموثّق."
          : lang === "en"
            ? "The evidenced fee was recorded."
            : "Les frais réels justifiés ont été enregistrés.",
    });
    await qc.invalidateQueries({ queryKey: ["admin-payouts"] });
    await qc.invalidateQueries({ queryKey: ["admin-unallocated-seller-transfer-fees"] });
  }

  async function confirmSellerPayout(payoutId: string) {
    if (payoutReference.trim().length < 3) {
      setNotice({ ok: false, text: a.payoutReferenceRequired });
      return;
    }
    setBusy("payout-paid");
    setNotice(null);
    const { error } = await adminMarkSellerPayoutPaid({
      data: { payoutId, transferReference: payoutReference.trim() },
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
    const { error } = await adminMarkSellerPayoutFailed({
      data: { payoutId, failureReason: payoutFailure.trim() },
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

  async function recheckIpayOrder(orderId: string) {
    setRecheckingOrderId(orderId);
    setNotice(null);
    try {
      const result = await adminRecheckIpayPayment({ data: { orderId } });
      if (!result.ok) {
        const message =
          result.error === "order_not_pending"
            ? lang === "ar"
              ? "الطلب لم يعد معلّقاً."
              : lang === "en"
                ? "The order is no longer pending."
                : "La commande n’est plus en attente."
            : result.error === "no_payment"
              ? lang === "ar"
                ? "لا يوجد مرجع دفع iPay لهذا الطلب."
                : lang === "en"
                  ? "No iPay payment reference exists for this order."
                  : "Aucune référence de paiement iPay pour cette commande."
              : lang === "ar"
                ? "تعذر التحقق من دفعة iPay."
                : lang === "en"
                  ? "Could not verify the iPay payment."
                  : "Impossible de vérifier le paiement iPay.";
        setNotice({ ok: false, text: message });
      } else {
        setNotice({
          ok: true,
          text:
            lang === "ar"
              ? `نتيجة التحقق من iPay: ${result.outcome}`
              : lang === "en"
                ? `iPay verification result: ${result.outcome}`
                : `Résultat de vérification iPay : ${result.outcome}`,
        });
      }
    } catch {
      setNotice({
        ok: false,
        text:
          lang === "ar"
            ? "حدث خطأ أثناء إعادة التحقق."
            : lang === "en"
              ? "An error occurred while rechecking the payment."
              : "Une erreur est survenue lors de la nouvelle vérification.",
      });
    } finally {
      setRecheckingOrderId(null);
      await qc.invalidateQueries({ queryKey: ["admin-orders"] });
    }
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
  const providerTotals = (verifiedProviderOrders.data ?? []).reduce(
    (totals, order) => {
      if (order.currency !== "TND") return totals;
      const hasIpay = Boolean(order.ipay_payment_ref);
      const hasKonnect = Boolean(order.konnect_payment_ref);
      if (hasIpay && !hasKonnect) {
        totals.ipay += order.total_millimes;
        totals.ipayCount += 1;
      } else if (hasKonnect && !hasIpay) {
        totals.konnect += order.total_millimes;
        totals.konnectCount += 1;
      } else {
        totals.unclassified += order.total_millimes;
      }
      return totals;
    },
    { ipay: 0, konnect: 0, ipayCount: 0, konnectCount: 0, unclassified: 0 },
  );
  const sellerBalances = new Map<
    string,
    { earned: number; transferred: number; reserved: number; commission: number }
  >();
  for (const entry of financialLedger.data ?? []) {
    if (!entry.store_id || entry.accounting_currency !== "TND") continue;
    const balance = sellerBalances.get(entry.store_id) ?? {
      earned: 0,
      transferred: 0,
      reserved: 0,
      commission: 0,
    };
    const amount = Number(entry.accounting_amount_millimes);
    if (entry.entry_type === "seller_payable" && entry.entry_side === "credit") {
      balance.earned += amount;
    } else if (entry.entry_type === "seller_payout" && entry.entry_side === "debit") {
      balance.transferred += amount;
    } else if (entry.entry_type === "platform_commission" && entry.entry_side === "credit") {
      balance.commission += amount;
    }
    sellerBalances.set(entry.store_id, balance);
  }
  for (const payout of payoutBalanceRows.data ?? []) {
    if (payout.status === "paid" || payout.status === "cancelled") continue;
    const balance = sellerBalances.get(payout.store_id) ?? {
      earned: 0,
      transferred: 0,
      reserved: 0,
      commission: 0,
    };
    balance.reserved += Number(payout.seller_amount_millimes);
    sellerBalances.set(payout.store_id, balance);
  }
  const financialTotals = Array.from(sellerBalances.values()).reduce(
    (totals, balance) => {
      totals.earned += balance.earned;
      totals.transferred += balance.transferred;
      totals.reserved += balance.reserved;
      totals.commission += balance.commission;
      return totals;
    },
    { earned: 0, transferred: 0, reserved: 0, commission: 0 },
  );
  const totalUnallocatedSellerTransferFees = Object.values(
    unallocatedSellerTransferFees.data ?? {},
  ).reduce((total, amount) => total + amount, 0);
  const availableSellerPayables = Math.max(
    0,
    financialTotals.earned -
      financialTotals.transferred -
      financialTotals.reserved -
      totalUnallocatedSellerTransferFees,
  );
  const selectedPayoutBalance = sellerBalances.get(payoutStoreId);
  const selectedPayoutAvailable = selectedPayoutBalance
    ? Math.max(
        0,
        selectedPayoutBalance.earned -
          selectedPayoutBalance.transferred -
          selectedPayoutBalance.reserved -
          (unallocatedSellerTransferFees.data?.[payoutStoreId] ?? 0),
      )
    : 0;
  const payoutMinimumMet = selectedPayoutAvailable >= 50_000;

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
        <div className="mb-2">
          <h2 className="text-lg font-bold">{a.financialLedgerTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{a.financialLedgerHelp}</p>
        </div>
        {financialLedger.isPending ||
        verifiedProviderOrders.isPending ||
        payoutBalanceRows.isPending ||
        unallocatedSellerTransferFees.isPending ? (
          <p className="mt-4 text-sm">{a.loading}</p>
        ) : financialLedger.isError ||
          verifiedProviderOrders.isError ||
          payoutBalanceRows.isError ||
          unallocatedSellerTransferFees.isError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {a.loadError}
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm text-muted-foreground">{a.providerKonnectVerified}</p>
                <p className="mt-1 text-xl font-bold">{formatTND(providerTotals.konnect)}</p>
                <p className="text-xs text-muted-foreground">
                  {providerTotals.konnectCount} {a.paidOrders}
                </p>
              </div>
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm text-muted-foreground">{a.providerIpayVerified}</p>
                <p className="mt-1 text-xl font-bold">{formatTND(providerTotals.ipay)}</p>
                <p className="text-xs text-muted-foreground">
                  {providerTotals.ipayCount} {a.paidOrders}
                </p>
              </div>
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm text-muted-foreground">{a.providerUnclassified}</p>
                <p className="mt-1 text-xl font-bold">{formatTND(providerTotals.unclassified)}</p>
              </div>
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm text-muted-foreground">{a.platformCommissionTotal}</p>
                <p className="mt-1 text-xl font-bold">{formatTND(financialTotals.commission)}</p>
              </div>
              <div className="rounded-lg bg-secondary p-4">
                <p className="text-sm text-muted-foreground">{a.sellerOutstandingTotal}</p>
                <p className="mt-1 text-xl font-bold">
                  {formatTND(Math.max(0, financialTotals.earned - financialTotals.transferred))}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {a.providerReconciliationNote}
            </p>
            <div className="mt-5">
              <h3 className="mb-3 font-semibold">{a.sellerBalances}</h3>
              {!stores.data?.length ? (
                <p className="rounded-lg bg-secondary p-3 text-sm">{a.noSellerBalances}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-collapse text-sm">
                    <thead>
                      <tr className="border-b border-border text-start text-muted-foreground">
                        <th className="px-3 py-3 text-start font-medium">{a.payoutStore}</th>
                        <th className="px-3 py-3 text-end font-medium">{a.sellerPayableTotal}</th>
                        <th className="px-3 py-3 text-end font-medium">
                          {a.sellerTransferredTotal}
                        </th>
                        <th className="px-3 py-3 text-end font-medium">{a.sellerReservedTotal}</th>
                        <th className="px-3 py-3 text-end font-medium">{a.sellerAvailableTotal}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stores.data.map((store) => {
                        const balance = sellerBalances.get(store.id) ?? {
                          earned: 0,
                          transferred: 0,
                          reserved: 0,
                          commission: 0,
                        };
                        const available = Math.max(
                          0,
                          balance.earned - balance.transferred - balance.reserved,
                        );
                        return (
                          <tr key={store.id} className="border-b border-border last:border-0">
                            <td className="px-3 py-3 font-medium">{store.name}</td>
                            <td className="px-3 py-3 text-end">{formatTND(balance.earned)}</td>
                            <td className="px-3 py-3 text-end">{formatTND(balance.transferred)}</td>
                            <td className="px-3 py-3 text-end">{formatTND(balance.reserved)}</td>
                            <td className="px-3 py-3 text-end font-semibold">
                              {formatTND(available)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold">
                        <td className="px-3 py-3">{a.sellerBalancesTotal}</td>
                        <td className="px-3 py-3 text-end">{formatTND(financialTotals.earned)}</td>
                        <td className="px-3 py-3 text-end">
                          {formatTND(financialTotals.transferred)}
                        </td>
                        <td className="px-3 py-3 text-end">
                          {formatTND(financialTotals.reserved)}
                        </td>
                        <td className="px-3 py-3 text-end">{formatTND(availableSellerPayables)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="mb-8 rounded-xl border border-border p-5">
        <h2 className="text-lg font-bold">
          {lang === "ar"
            ? "التحكم في الدفع عبر iPay"
            : lang === "en"
              ? "iPay checkout control"
              : "Contrôle du paiement iPay"}
        </h2>
        <p className="mt-2 text-sm leading-7 text-muted-foreground">
          {lang === "ar"
            ? "مفتاح إداري يوقف إنشاء عمليات دفع جديدة. لا يعمل الدفع إلا إذا كان هذا المفتاح ومفتاح الخادم IPAY_CHECKOUT_ENABLED مفعّلين معاً. لا يلغي روابط الدفع التي أنشأها iPay مسبقاً."
            : lang === "en"
              ? "Admin switch that blocks new payment initializations. Checkout requires this switch and the independent IPAY_CHECKOUT_ENABLED server gate. It cannot revoke iPay payment links already created."
              : "Interrupteur admin bloquant les nouvelles initialisations. Le paiement exige aussi la variable serveur IPAY_CHECKOUT_ENABLED. Les liens iPay déjà créés ne sont pas révoqués."}
        </p>
        {settings.isPending ? (
          <p className="mt-3 text-sm">{a.loading}</p>
        ) : settings.isError ? (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {a.loadError}
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-semibold">
              {settings.data.ipay_checkout_enabled
                ? lang === "ar"
                  ? "مفتاح الإدارة: مفعّل"
                  : lang === "en"
                    ? "Admin switch: ON"
                    : "Commutateur admin : ACTIVÉ"
                : lang === "ar"
                  ? "مفتاح الإدارة: متوقف"
                  : lang === "en"
                    ? "Admin switch: OFF"
                    : "Commutateur admin : ARRÊTÉ"}
            </span>
            <button
              type="button"
              disabled={busy === "ipay-switch"}
              onClick={() => void setIpayCheckoutEnabled(!settings.data.ipay_checkout_enabled)}
              className={
                settings.data.ipay_checkout_enabled
                  ? "rounded-full border border-destructive px-4 py-2 text-sm font-semibold text-destructive disabled:opacity-50"
                  : "rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              }
            >
              {busy === "ipay-switch"
                ? a.saving
                : settings.data.ipay_checkout_enabled
                  ? lang === "ar"
                    ? "إيقاف عمليات الدفع الجديدة"
                    : lang === "en"
                      ? "Stop new payment attempts"
                      : "Bloquer les nouveaux paiements"
                  : lang === "ar"
                    ? "تشغيل المفتاح الإداري"
                    : lang === "en"
                      ? "Enable admin switch"
                      : "Activer le commutateur"}
            </button>
          </div>
        )}
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
        <div className="mb-4 rounded-lg bg-secondary/60 p-4">
          <h3 className="text-sm font-semibold">
            {lang === "ar"
              ? "تسجيل رسوم التحويل الفعلية"
              : lang === "en"
                ? "Record actual transfer fee"
                : "Enregistrer les frais réels de transfert"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {lang === "ar"
              ? "اختاري فئة التعريفة كمرجع داخلي، ثم أدخلي المبلغ الفعلي الظاهر في كشف العملية والمرجع. لا تُحتسب الضريبة تلقائيًا ولا تُسجّل رسوم تقديرية."
              : lang === "en"
                ? "Choose the internal tariff reference, then enter the actual amount shown on the transaction statement and its reference. Tax is not added automatically; estimates are not accepted."
                : "Choisissez la catégorie tarifaire comme référence interne, puis saisissez le montant réellement débité et sa référence. Aucune TVA n’est ajoutée automatiquement et aucun montant estimatif n’est enregistré."}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <select
              value={feeClass}
              onChange={(e) => {
                const value = e.target.value;
                setFeeClass(value);
                // Tariffs are references only; the actual debited amount must be entered manually.
                setFeeAmount("");
              }}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="digital_same_bank">Digital · UIB vers UIB · 2,000 TND HT</option>
              <option value="digital_other_bank">
                Digital · autre banque tunisienne · 2,500 TND HT
              </option>
              <option value="branch_same_bank">Agence · UIB vers UIB · 3,000 TND HT</option>
              <option value="branch_other_bank">
                Agence · autre banque tunisienne · 3,500 TND HT
              </option>
              <option value="manual_list_same_bank">
                Liste manuelle · bénéficiaire UIB · 1,200 TND HT
              </option>
              <option value="manual_list_other_bank">
                Liste manuelle · autre banque · 1,500 TND HT
              </option>
            </select>
            <input
              aria-label={
                lang === "ar"
                  ? "المبلغ الفعلي"
                  : lang === "en"
                    ? "Actual fee amount"
                    : "Montant réel des frais"
              }
              type="number"
              min="0.001"
              step="0.001"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              placeholder="Montant réellement débité (TND)"
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              aria-label={
                lang === "ar"
                  ? "مرجع كشف العملية"
                  : lang === "en"
                    ? "Statement reference"
                    : "Référence du relevé"
              }
              value={feeReference}
              onChange={(e) => setFeeReference(e.target.value)}
              placeholder={
                lang === "ar"
                  ? "مرجع العملية في الكشف"
                  : lang === "en"
                    ? "Statement transaction reference"
                    : "Référence de l’opération sur le relevé"
              }
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm sm:col-span-2"
            />
          </div>
          <button
            type="button"
            disabled={!payoutStoreId || busy === "payout-fee" || !feeAmount || !feeReference.trim()}
            onClick={() => void recordSellerTransferFee()}
            className="mt-3 rounded-full border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "payout-fee"
              ? a.saving
              : lang === "ar"
                ? "تسجيل الرسم"
                : lang === "en"
                  ? "Record fee"
                  : "Enregistrer les frais"}
          </button>
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
            disabled={busy === "payout-create" || !payoutStoreId || !payoutMinimumMet}
            onClick={() => void createSellerPayout()}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold disabled:opacity-50"
          >
            {busy === "payout-create" ? a.saving : a.createPayout}
          </button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {payoutStoreId
            ? payoutMinimumMet
              ? a.payoutMinimumEligible
              : a.payoutMinimumNotMet
            : a.payoutMinimumHelp}
          {payoutStoreId ? ` · ${formatTND(selectedPayoutAvailable)}` : ""}
        </p>
        {payouts.isPending ? (
          <p className="mt-4 text-sm">{a.loading}</p>
        ) : payouts.isError ? (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            <p>{a.loadError}</p>
            <button
              type="button"
              onClick={() => void payouts.refetch()}
              className="mt-2 rounded-full border border-current px-3 py-1 text-xs font-semibold"
            >
              {lang === "ar" ? "إعادة المحاولة" : lang === "en" ? "Retry" : "Réessayer"}
            </button>
          </div>
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
                        ? "رسوم التحويل"
                        : lang === "en"
                          ? "Transfer fees"
                          : "Frais de transfert"}
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
                    {getProductTypeLabel(
                      product.product_type,
                      lang,
                      t.marketplace as unknown as Record<string, string>,
                    )}
                    {getSubcategoryLabel(product.product_type, product.product_subcategory, lang)
                      ? " · " +
                        getSubcategoryLabel(product.product_type, product.product_subcategory, lang)
                      : ""}{" "}
                    ·{" "}
                    {product.sale_price_millimes ? (
                      <>
                        <span className="text-xs font-bold text-red-600">PROMO</span>
                        <span className="text-muted-foreground line-through">
                          {formatTND(product.price_millimes)}
                        </span>
                        <span className="font-semibold text-red-600">
                          {formatTND(product.sale_price_millimes)}
                        </span>
                      </>
                    ) : (
                      formatTND(product.price_millimes)
                    )}{" "}
                    · {product.store_id?.slice(0, 8) ?? "—"}
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
          <div role="alert" className="rounded-xl border border-destructive/30 bg-secondary p-4">
            <p className="font-semibold">{a.loadError}</p>
            <button
              type="button"
              onClick={() => void orders.refetch()}
              className="mt-3 rounded-full border border-border px-3 py-2 text-xs font-semibold"
            >
              {lang === "ar" ? "إعادة المحاولة" : lang === "en" ? "Retry" : "Réessayer"}
            </button>
          </div>
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
                  {order.ipay_payment_ref && (
                    <p className="text-xs text-muted-foreground">
                      iPay · {order.ipay_payment_ref.slice(0, 16)}
                    </p>
                  )}
                  {order.konnect_payment_ref && (
                    <p className="text-xs text-muted-foreground">
                      Konnect · {order.konnect_payment_ref.slice(0, 16)}
                    </p>
                  )}
                  {order.status === "pending" && order.ipay_payment_ref && (
                    <button
                      type="button"
                      disabled={recheckingOrderId !== null}
                      onClick={() => void recheckIpayOrder(order.id)}
                      className="mt-2 rounded-full border border-border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                    >
                      {recheckingOrderId === order.id
                        ? lang === "ar"
                          ? "جارٍ التحقق…"
                          : lang === "en"
                            ? "Checking…"
                            : "Vérification…"
                        : lang === "ar"
                          ? "إعادة التحقق عبر iPay"
                          : lang === "en"
                            ? "Recheck with iPay"
                            : "Revérifier avec iPay"}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </AuthShell>
  );
}
