import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

type Store = { id: string; name: string; slug: string; status: "active" | "suspended" };

const KONNECT_SELLER_REGISTRATION_URL = "https://dashboard.konnect.network/auth/register?referrerCode=31XyM7MR8wy71ga7a";
const PRIVACY_VERSION = "2026-10-31-v1";
const TERMS_VERSION = "2026-10-31-v1";

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50);
}

export function StoreOnboarding({ userId, emailConfirmed }: { userId: string; emailConfirmed: boolean }) {
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = {
    fr: {
      title: "Ma boutique", intro: "Ouvrez gratuitement votre boutique sur Algorea Bazaar.",
      name: "Nom de la boutique", slug: "Adresse de la boutique", create: "Créer ma boutique",
      loading: "Chargement…", active: "Boutique active", suspended: "Boutique suspendue",
      address: "Identifiant", confirm: "Confirmez votre adresse e-mail pour ouvrir une boutique.",
      invalid: "Le nom doit contenir entre 1 et 120 caractères. L’adresse doit comporter 3 à 50 caractères minuscules, chiffres ou tirets.",
      failed: "Impossible de créer la boutique. Vérifiez l’adresse choisie ou réessayez.",
      success: "Votre boutique a été créée.", free: "Création et gestion de la boutique gratuites.",
      privacyCheck: "J’ai lu et j’accepte la politique de confidentialité.",
      termsCheck: "J’ai lu et j’accepte les conditions générales et les règles applicables aux vendeurs.",
      privacyTitle: "Politique de confidentialité — version 2026-10-31-v1",
      termsTitle: "Conditions générales vendeurs — version 2026-10-31-v1",
      privacyText: "Algorea Bazaar utilise les données nécessaires à la création et à la gestion du compte et de la boutique, à la sécurité, à l’assistance et au fonctionnement de la marketplace. Les données ne sont accessibles qu’aux personnes et prestataires autorisés pour ces finalités. Les données de commande, de paiement et de conformité peuvent être conservées pendant les durées imposées par les obligations légales ou la résolution des litiges. Vous pouvez demander l’accès, la rectification ou la suppression des données lorsque la loi le permet, via le canal de contact officiel de la plateforme. Les cookies ou traceurs non essentiels ne doivent être activés qu’avec le consentement requis. Cette politique sera complétée avec l’identité légale de l’exploitant, ses coordonnées, les prestataires effectivement utilisés et les délais de conservation avant l’ouverture publique.",
      termsText: "Le vendeur doit fournir des informations exactes, détenir les droits nécessaires sur chaque produit numérique et respecter les lois applicables. Les contenus illicites, trompeurs, contrefaisants ou portant atteinte aux droits de tiers sont interdits. Le vendeur reste responsable de ses produits, de leur description, de leurs licences et de l’assistance due aux acheteurs. L’ouverture du compte, de la boutique et la mise en ligne des annonces sont gratuites. La commission de la plateforme est fixée à 5 % du montant de vente, sous réserve des modalités affichées avant toute activation des paiements. Les frais externes du prestataire de paiement sont distincts et doivent être communiqués avant confirmation. Aucun paiement réel n’est activé par la présente acceptation. La plateforme peut suspendre une boutique en cas de fraude, d’atteinte à la sécurité ou de violation des règles, avec un examen approprié. Les modalités de retrait, remboursements, fiscalité, droit applicable, juridiction et coordonnées de l’exploitant doivent être finalisées et publiées avant l’ouverture commerciale.",
      legalNotice: "Ces textes sont une version de travail et doivent être complétés et validés juridiquement avant le lancement commercial.",
      required: "Acceptez les deux documents pour continuer.",
      konnectRegister: "S’inscrire sur Konnect via le lien de la plateforme",
      konnectEligibility: "Ce lien est proposé à tous les vendeurs, quel que soit leur pays ou leur lieu de résidence. Konnect vérifie directement l’identité, le téléphone et le moyen de réception du vendeur, puis décide de son éligibilité. Le lien ne garantit pas l’acceptation et n’active pas les virements automatiques.",
    },
    ar: {
      title: "متجري", intro: "أنشئي متجرك مجاناً على Algorea Bazaar.",
      name: "اسم المتجر", slug: "رابط المتجر", create: "إنشاء متجري",
      loading: "جارٍ التحميل…", active: "المتجر نشط", suspended: "المتجر موقوف",
      address: "المعرّف", confirm: "يرجى تأكيد بريدك الإلكتروني قبل إنشاء المتجر.",
      invalid: "يجب أن يتراوح اسم المتجر بين حرف و120 حرفاً، وأن يتكون الرابط من 3 إلى 50 حرفاً صغيراً أو رقماً أو شرطة.",
      failed: "تعذر إنشاء المتجر. جرّبي رابطاً آخر أو أعيدي المحاولة.",
      success: "تم إنشاء متجرك بنجاح.", free: "إنشاء المتجر وإدارته مجانيان.",
      privacyCheck: "قرأت سياسة الخصوصية وأوافق عليها.",
      termsCheck: "قرأت الشروط والأحكام والقواعد الخاصة بالبائعين وأوافق عليها.",
      privacyTitle: "سياسة الخصوصية — الإصدار 2026-10-31-v1",
      termsTitle: "الشروط القانونية للبائعين — الإصدار 2026-10-31-v1",
      privacyText: "تستخدم Algorea Bazaar البيانات اللازمة لإنشاء الحساب والمتجر وإدارتهما، وللأمان والدعم وتشغيل السوق. لا يطّلع على البيانات إلا الأشخاص ومقدمو الخدمات المصرح لهم وللأغراض المحددة. قد نحتفظ ببيانات الطلبات والمدفوعات والامتثال للمدد التي تفرضها الالتزامات القانونية أو تسوية النزاعات. يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها حيث يسمح القانون، عبر قناة الاتصال الرسمية للمنصة. لا تُفعّل ملفات الارتباط أو أدوات التتبع غير الضرورية إلا بعد الحصول على الموافقة المطلوبة. يجب استكمال هذه السياسة بهوية المشغّل القانونية وبيانات الاتصال ومقدمي الخدمات المستخدمين فعلياً ومدد الاحتفاظ قبل الإطلاق العام.",
      termsText: "يلتزم البائع بتقديم معلومات صحيحة وامتلاك الحقوق اللازمة لكل منتج رقمي واحترام القوانين المعمول بها. يُمنع المحتوى غير القانوني أو المضلل أو المقلد أو المنتهك لحقوق الغير. يبقى البائع مسؤولاً عن منتجاته وأوصافها وتراخيصها ودعم المشترين. إنشاء الحساب والمتجر وإضافة المنتجات مجاني دائماً. عمولة المنصة 5% من مبلغ البيع، وفق التفاصيل التي ستُعرض قبل تفعيل المدفوعات. رسوم مزود الدفع الخارجية منفصلة ويجب توضيحها قبل التأكيد. لا يؤدي قبول هذه الشروط إلى تفعيل المدفوعات الحقيقية. يجوز تعليق المتجر عند الاحتيال أو تهديد الأمان أو مخالفة القواعد، مع إجراء مراجعة مناسبة. يجب استكمال ونشر أحكام السحب والاسترداد والضرائب والقانون الواجب التطبيق والاختصاص القضائي وبيانات مشغّل المنصة قبل بدء النشاط التجاري.",
      legalNotice: "هذه النصوص مسودة عمل، ويجب استكمالها ومراجعتها قانونياً قبل الإطلاق التجاري.",
      required: "يرجى الموافقة على الوثيقتين للمتابعة.",
      konnectRegister: "التسجيل في Konnect عبر رابط المنصة",
      konnectEligibility: "الرابط متاح لجميع البائعين مهما كانت بلدانهم أو أماكن إقامتهم. تتولى Konnect مباشرة التحقق من هوية البائع ورقم هاتفه ووسيلة استلام أمواله وتحديد أهليته. لا يضمن الرابط قبول الحساب ولا يفعّل التحويلات التلقائية.",
    },
    en: {
      title: "My store", intro: "Open your store on Algorea Bazaar for free.",
      name: "Store name", slug: "Store address", create: "Create my store",
      loading: "Loading…", active: "Store active", suspended: "Store suspended",
      address: "Slug", confirm: "Confirm your email address before opening a store.",
      invalid: "Store name must be 1–120 characters. Address must be 3–50 lowercase letters, numbers, or hyphens.",
      failed: "Could not create the store. Try another address or try again.",
      success: "Your store was created.", free: "Store creation and management are free.",
      privacyCheck: "I have read and agree to the Privacy Policy.",
      termsCheck: "I have read and agree to the Terms and Conditions and seller rules.",
      privacyTitle: "Privacy Policy — version 2026-10-31-v1",
      termsTitle: "Seller Terms — version 2026-10-31-v1",
      privacyText: "Algorea Bazaar uses the information needed to create and manage accounts and stores, provide security and support, and operate the marketplace. Data is accessible only to authorized people and providers for these purposes. Order, payment and compliance records may be retained for periods required by law or dispute resolution. You may request access, correction or deletion where permitted by law through the platform’s official contact channel. Non-essential cookies or trackers must only be enabled with any required consent. Before public launch, this policy must be completed with the operator’s legal identity, contact details, actual service providers and retention periods.",
      termsText: "Sellers must provide accurate information, own or hold the necessary rights to each digital product, and comply with applicable laws. Illegal, misleading, counterfeit or rights-infringing content is prohibited. Sellers remain responsible for their products, descriptions, licenses and buyer support. Account creation, store opening and listings are free. The platform commission is 5% of the sale amount, subject to the details shown before payment activation. External payment-provider fees are separate and must be disclosed before confirmation. This acceptance does not activate live payments. The platform may suspend a store for fraud, security risks or rule violations, subject to appropriate review. Withdrawal, refund, tax, governing-law, jurisdiction and operator-contact terms must be finalized and published before commercial launch.",
      legalNotice: "These are working drafts and must be completed and legally reviewed before commercial launch.",
      required: "Accept both documents to continue.",
      konnectRegister: "Register with Konnect using the platform link",
      konnectEligibility: "This link is available to all sellers, regardless of country or residence. Konnect independently verifies each seller’s identity, phone number and receiving method, and decides eligibility. The link does not guarantee acceptance or enable automatic payouts.",
    },
  }[lang];

  const stores = useQuery({
    queryKey: ["seller-stores", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores")
        .select("id, name, slug, status").eq("owner_id", userId).order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });

  async function createStore(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slugify(slug);
    if (cleanName.length < 1 || cleanName.length > 120 || !/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(cleanSlug)) {
      setFeedback({ ok: false, text: copy.invalid });
      return;
    }
    if (!emailConfirmed || !acceptPrivacy || !acceptTerms || (stores.data?.length ?? 0) > 0) {
      if (!acceptPrivacy || !acceptTerms) setFeedback({ ok: false, text: copy.required });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const { data, error } = await supabase.rpc("create_seller_store", {
      _name: cleanName,
      _slug: cleanSlug,
      _privacy_version: PRIVACY_VERSION,
      _terms_version: TERMS_VERSION,
    });
    setBusy(false);
    if (error || !data) {
      setFeedback({ ok: false, text: copy.failed });
      return;
    }
    setFeedback({ ok: true, text: copy.success });
    await queryClient.invalidateQueries({ queryKey: ["seller-stores", userId] });
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-bold">{copy.title}</h2>
      <p className="mt-2 text-base text-muted-foreground">{copy.intro}</p>
      <p className="mt-2 text-sm font-semibold text-primary">{copy.free}</p>
      {stores.isPending ? <p className="mt-4 text-base text-muted-foreground">{copy.loading}</p> :
       stores.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{copy.failed}</p> :
       stores.data.length > 0 ? (
        <div className="mt-5 space-y-3">
          {stores.data.map((store) => (
            <div key={store.id} className="rounded-xl bg-secondary p-4">
              <p className="font-semibold">{store.name}</p>
              <p className="mt-1 text-sm text-muted-foreground" dir="ltr">{copy.address}: /{store.slug}</p>
              <p className="mt-2 text-sm font-semibold">{store.status === "active" ? copy.active : copy.suspended}</p>
            </div>
          ))}
          <a href={KONNECT_SELLER_REGISTRATION_URL} target="_blank" rel="noopener noreferrer"
            className="inline-flex rounded-full bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90">
            {copy.konnectRegister}
          </a>
          <p className="text-xs leading-6 text-muted-foreground">{copy.konnectEligibility}</p>
        </div>
      ) : !emailConfirmed ? (
        <p className="mt-5 rounded-xl bg-secondary p-4 text-sm">{copy.confirm}</p>
      ) : (
        <form onSubmit={createStore} className="mt-5 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-semibold">{copy.name}</span>
            <input required minLength={1} maxLength={120} value={name}
              onChange={(event) => {
                const value = event.target.value;
                setName(value);
                if (!slugEdited) setSlug(slugify(value));
              }}
              className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base" />
          </label>
          <label className="block space-y-2">
            <span className="text-sm font-semibold">{copy.slug}</span>
            <input required minLength={3} maxLength={50} pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={slug} onChange={(event) => { setSlugEdited(true); setSlug(event.target.value); }}
              dir="ltr" className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base" />
          </label>
          <div className="space-y-3 rounded-xl border border-border p-4">
            <details id="privacy-policy" className="text-sm">
              <summary className="cursor-pointer font-semibold underline">{copy.privacyTitle}</summary>
              <p className="mt-3 leading-7 text-muted-foreground">{copy.privacyText}</p>
            </details>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input type="checkbox" checked={acceptPrivacy} onChange={(e) => setAcceptPrivacy(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-primary" />
              <span>{copy.privacyCheck}</span>
            </label>
            <details id="seller-terms" className="text-sm">
              <summary className="cursor-pointer font-semibold underline">{copy.termsTitle}</summary>
              <p className="mt-3 leading-7 text-muted-foreground">{copy.termsText}</p>
            </details>
            <label className="flex items-start gap-3 text-sm leading-6">
              <input type="checkbox" checked={acceptTerms} onChange={(e) => setAcceptTerms(e.target.checked)}
                className="mt-1 size-5 shrink-0 accent-primary" />
              <span>{copy.termsCheck}</span>
            </label>
            <p className="text-xs text-muted-foreground">{copy.legalNotice}</p>
          </div>
          {feedback && <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{feedback.text}</p>}
          <button type="submit" disabled={busy || !acceptPrivacy || !acceptTerms} className="w-full rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? copy.loading : copy.create}
          </button>
        </form>
      )}
    </section>
  );
}
