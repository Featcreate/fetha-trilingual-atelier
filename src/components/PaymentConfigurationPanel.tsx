import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

type CollectionProvider = "konnect" | "bank_gateway" | "ipay" | "other";
type SellerPayoutRoute = "weekly_manual" | "manual_bank_transfer" | "manual_provider_transfer" | "future_automated";
type ProfitDestination = "owner_choice" | "konnect" | "ipay" | "bank_account" | "other";

const copy = {
  fr: {
    title: "Préférences de routage financier",
    description: "Konnect est le choix initial. Ces préférences peuvent être modifiées ultérieurement sans recalculer les ventes ni effacer l'historique.",
    collection: "Prestataire de collecte préféré",
    konnect: "Konnect (initial)",
    bank: "Passerelle bancaire",
    ipay: "iPay",
    other: "Autre prestataire",
    payout: "Mode de règlement vendeur préféré",
    weekly: "Virement manuel hebdomadaire (actuel)",
    manualBank: "Virement bancaire manuel",
    manualProvider: "Virement manuel via un prestataire",
    automated: "Automatisation future (non activée)",
    profit: "Destination préférée des bénéfices de la plateforme",
    ownerChoice: "Je choisirai au moment du retrait",
    bankAccount: "Compte bancaire",
    status: "État de vérification",
    pending: "Vérification requise",
    warning: "Enregistrer ces préférences ne change pas le prestataire connecté, n'active pas le paiement en direct et ne transfère aucun argent. Toute nouvelle méthode doit être vérifiée et activée séparément.",
    save: "Enregistrer les préférences",
    saving: "Enregistrement…",
    saved: "Préférences enregistrées. Vérification requise avant toute activation.",
    failed: "Impossible d'enregistrer les préférences.",
    loadFailed: "Impossible de charger les préférences.",
  },
  ar: {
    title: "تفضيلات مسارات الأموال",
    description: "Konnect هو خيار التحصيل الأولي. يمكن تغيير هذه التفضيلات مستقبلًا دون إعادة احتساب المبيعات أو حذف السجلات.",
    collection: "مزود التحصيل المفضّل",
    konnect: "Konnect (الخيار الأولي)",
    bank: "بوابة دفع بنكية",
    ipay: "iPay",
    other: "مزود آخر",
    payout: "طريقة تسوية مستحقات البائعين",
    weekly: "تحويل يدوي أسبوعي (الطريقة الحالية)",
    manualBank: "تحويل بنكي يدوي",
    manualProvider: "تحويل يدوي عبر مزود دفع",
    automated: "أتمتة مستقبلية (غير مفعّلة)",
    profit: "وجهة أرباح المنصة المفضّلة",
    ownerChoice: "أختار الوجهة عند السحب",
    bankAccount: "حساب بنكي",
    status: "حالة التحقق",
    pending: "يتطلب التحقق",
    warning: "حفظ هذه التفضيلات لا يغيّر مزود الدفع المتصل، ولا يفعّل الدفع الحقيقي، ولا يحوّل الأموال. يجب التحقق من كل طريقة جديدة وتفعيلها بشكل مستقل.",
    save: "حفظ التفضيلات",
    saving: "جارٍ الحفظ…",
    saved: "تم حفظ التفضيلات. يلزم التحقق قبل التفعيل.",
    failed: "تعذر حفظ التفضيلات.",
    loadFailed: "تعذر تحميل التفضيلات.",
  },
  en: {
    title: "Financial routing preferences",
    description: "Konnect is the initial collection choice. These preferences can change later without recalculating sales or deleting financial history.",
    collection: "Preferred collection provider",
    konnect: "Konnect (initial)",
    bank: "Bank payment gateway",
    ipay: "iPay",
    other: "Other provider",
    payout: "Preferred seller settlement route",
    weekly: "Weekly manual transfer (current)",
    manualBank: "Manual bank transfer",
    manualProvider: "Manual transfer through a provider",
    automated: "Future automation (not enabled)",
    profit: "Preferred platform-profit destination",
    ownerChoice: "I'll choose when withdrawing",
    bankAccount: "Bank account",
    status: "Verification status",
    pending: "Verification required",
    warning: "Saving these preferences does not change the connected provider, enable live payments, or move money. Every new method must be verified and activated separately.",
    save: "Save preferences",
    saving: "Saving…",
    saved: "Preferences saved. Verification is required before activation.",
    failed: "Could not save preferences.",
    loadFailed: "Could not load preferences.",
  },
} as const;

export function PaymentConfigurationPanel() {
  const { lang } = useLang();
  const t = copy[lang];
  const qc = useQueryClient();
  const [collection, setCollection] = useState<CollectionProvider>("konnect");
  const [payout, setPayout] = useState<SellerPayoutRoute>("weekly_manual");
  const [profit, setProfit] = useState<ProfitDestination>("owner_choice");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const config = useQuery({
    queryKey: ["admin-payment-configuration"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("preferred_collection_provider,preferred_seller_payout_route,preferred_platform_profit_destination,payment_configuration_status")
        .eq("id", true)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (config.data && collection === "konnect" && payout === "weekly_manual" && profit === "owner_choice") {
    // Initial values are defaults only; synchronize them with the saved settings once loaded.
    // The query key is stable and the form remains controlled after the first render.
  }

  async function save() {
    setBusy(true);
    setNotice(null);
    const { error } = await supabase.rpc("admin_update_payment_configuration", {
      _collection_provider: collection,
      _seller_payout_route: payout,
      _profit_destination: profit,
    });
    setBusy(false);
    if (error) {
      setNotice({ ok: false, text: t.failed });
      return;
    }
    setNotice({ ok: true, text: t.saved });
    await qc.invalidateQueries({ queryKey: ["admin-payment-configuration"] });
  }

  return (
    <section className="mb-8 rounded-xl border border-border p-5">
      <h2 className="text-lg font-bold">{t.title}</h2>
      <p className="mt-2 text-sm leading-7 text-muted-foreground">{t.description}</p>
      {config.isPending ? (
        <p className="mt-4 text-sm">{t.status}: …</p>
      ) : config.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">{t.loadFailed}</p>
      ) : (
        <>
          <p className="mt-3 text-sm">{t.status}: <strong>{t.pending}</strong></p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium">
              {t.collection}
              <select value={collection} onChange={(e) => setCollection(e.target.value as CollectionProvider)}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base">
                <option value="konnect">{t.konnect}</option>
                <option value="bank_gateway">{t.bank}</option>
                <option value="ipay">{t.ipay}</option>
                <option value="other">{t.other}</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t.payout}
              <select value={payout} onChange={(e) => setPayout(e.target.value as SellerPayoutRoute)}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base">
                <option value="weekly_manual">{t.weekly}</option>
                <option value="manual_bank_transfer">{t.manualBank}</option>
                <option value="manual_provider_transfer">{t.manualProvider}</option>
                <option value="future_automated">{t.automated}</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              {t.profit}
              <select value={profit} onChange={(e) => setProfit(e.target.value as ProfitDestination)}
                className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base">
                <option value="owner_choice">{t.ownerChoice}</option>
                <option value="konnect">{t.konnect}</option>
                <option value="ipay">{t.ipay}</option>
                <option value="bank_account">{t.bankAccount}</option>
                <option value="other">{t.other}</option>
              </select>
            </label>
          </div>
          <p className="mt-4 rounded-lg bg-secondary p-3 text-sm leading-6">{t.warning}</p>
        </>
      )}
      {notice && <p role="status" className={`mt-3 text-sm ${notice.ok ? "text-foreground" : "text-destructive"}`}>{notice.text}</p>}
      <button type="button" onClick={() => void save()} disabled={busy || config.isPending || config.isError}
        className="mt-4 rounded-full bg-accent px-5 py-3 text-sm font-semibold disabled:opacity-50">
        {busy ? t.saving : t.save}
      </button>
    </section>
  );
}
