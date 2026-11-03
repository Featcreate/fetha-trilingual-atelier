import type { Lang } from "@/lib/i18n";

export const SELLER_PRIVACY_VERSION = "2026-10-31-v1";
export const SELLER_TERMS_VERSION = "2026-10-31-v1";

type Props = {
  lang: Lang;
  privacyAccepted: boolean;
  termsAccepted: boolean;
  onPrivacyChange: (value: boolean) => void;
  onTermsChange: (value: boolean) => void;
};

const copy = {
  fr: {
    privacyTitle: "Politique de confidentialité — version 2026-10-31-v1",
    termsTitle: "Conditions générales vendeurs — version 2026-10-31-v1",
    privacyCheck: "J’ai lu et j’accepte la politique de confidentialité.",
    termsCheck: "J’ai lu et j’accepte les conditions générales et les règles applicables aux vendeurs.",
    privacyText: "Algorea Bazaar utilise les données nécessaires à la création et à la gestion du compte et de la boutique, à la sécurité, à l’assistance et au fonctionnement de la marketplace. Les données ne sont accessibles qu’aux personnes et prestataires autorisés pour ces finalités. Les données de commande, de paiement et de conformité peuvent être conservées pendant les durées imposées par les obligations légales ou la résolution des litiges. Vous pouvez demander l’accès, la rectification ou la suppression des données lorsque la loi le permet, via le canal de contact officiel de la plateforme. Les cookies ou traceurs non essentiels ne doivent être activés qu’avec le consentement requis. Cette politique sera complétée avec l’identité légale de l’exploitant, ses coordonnées, les prestataires effectivement utilisés et les délais de conservation avant l’ouverture publique.",
    termsText: "Le vendeur doit fournir des informations exactes, détenir les droits nécessaires sur chaque produit numérique et respecter les lois applicables. Les contenus illicites, trompeurs, contrefaisants ou portant atteinte aux droits de tiers sont interdits. Le vendeur reste responsable de ses produits, de leur description, de leurs licences et de l’assistance due aux acheteurs. L’ouverture du compte, de la boutique et la mise en ligne des annonces sont gratuites. La commission de la plateforme est fixée à 5 % du montant de vente, sous réserve des modalités affichées avant toute activation des paiements. Les frais externes du prestataire de paiement sont distincts et doivent être communiqués avant confirmation. Aucun paiement réel n’est activé par la présente acceptation. La plateforme peut suspendre une boutique en cas de fraude, d’atteinte à la sécurité ou de violation des règles, avec un examen approprié. Les modalités de retrait, remboursements, fiscalité, droit applicable, juridiction et coordonnées de l’exploitant doivent être finalisées et publiées avant l’ouverture commerciale.",
    notice: "Version de travail approuvée pour intégration ; les coordonnées de l’exploitant et les éléments juridiques manquants doivent être complétés et validés avant le lancement commercial.",
  },
  ar: {
    privacyTitle: "سياسة الخصوصية — الإصدار 2026-10-31-v1",
    termsTitle: "الشروط القانونية للبائعين — الإصدار 2026-10-31-v1",
    privacyCheck: "قرأت سياسة الخصوصية وأوافق عليها.",
    termsCheck: "قرأت الشروط والأحكام والقواعد الخاصة بالبائعين وأوافق عليها.",
    privacyText: "تستخدم Algorea Bazaar البيانات اللازمة لإنشاء الحساب والمتجر وإدارتهما، وللأمان والدعم وتشغيل السوق. لا يطّلع على البيانات إلا الأشخاص ومقدمو الخدمات المصرح لهم وللأغراض المحددة. قد نحتفظ ببيانات الطلبات والمدفوعات والامتثال للمدد التي تفرضها الالتزامات القانونية أو تسوية النزاعات. يمكنك طلب الوصول إلى بياناتك أو تصحيحها أو حذفها حيث يسمح القانون، عبر قناة الاتصال الرسمية للمنصة. لا تُفعّل ملفات الارتباط أو أدوات التتبع غير الضرورية إلا بعد الحصول على الموافقة المطلوبة. يجب استكمال هذه السياسة بهوية المشغّل القانونية وبيانات الاتصال ومقدمي الخدمات المستخدمين فعلياً ومدد الاحتفاظ قبل الإطلاق العام.",
    termsText: "يلتزم البائع بتقديم معلومات صحيحة وامتلاك الحقوق اللازمة لكل منتج رقمي واحترام القوانين المعمول بها. يُمنع المحتوى غير القانوني أو المضلل أو المقلد أو المنتهك لحقوق الغير. يبقى البائع مسؤولاً عن منتجاته وأوصافها وتراخيصها ودعم المشترين. إنشاء الحساب والمتجر وإضافة المنتجات مجاني دائماً. عمولة المنصة 5% من مبلغ البيع، وفق التفاصيل التي ستُعرض قبل تفعيل المدفوعات. رسوم مزود الدفع الخارجية منفصلة ويجب توضيحها قبل التأكيد. لا يؤدي قبول هذه الشروط إلى تفعيل المدفوعات الحقيقية. يجوز تعليق المتجر عند الاحتيال أو تهديد الأمان أو مخالفة القواعد، مع إجراء مراجعة مناسبة. يجب استكمال ونشر أحكام السحب والاسترداد والضرائب والقانون الواجب التطبيق والاختصاص القضائي وبيانات مشغّل المنصة قبل بدء النشاط التجاري.",
    notice: "هذه هي النسخة المعتمدة للإدماج؛ يجب استكمال بيانات مشغّل المنصة والعناصر القانونية الناقصة ومراجعتها قبل الإطلاق التجاري.",
  },
  en: {
    privacyTitle: "Privacy Policy — version 2026-10-31-v1",
    termsTitle: "Seller Terms — version 2026-10-31-v1",
    privacyCheck: "I have read and agree to the Privacy Policy.",
    termsCheck: "I have read and agree to the Terms and Conditions and seller rules.",
    privacyText: "Algorea Bazaar uses the information needed to create and manage accounts and stores, provide security and support, and operate the marketplace. Data is accessible only to authorized people and providers for these purposes. Order, payment and compliance records may be retained for periods required by law or dispute resolution. You may request access, correction or deletion where permitted by law through the platform’s official contact channel. Non-essential cookies or trackers must only be enabled with any required consent. Before public launch, this policy must be completed with the operator’s legal identity, contact details, actual service providers and retention periods.",
    termsText: "Sellers must provide accurate information, own or hold the necessary rights to each digital product, and comply with applicable laws. Illegal, misleading, counterfeit or rights-infringing content is prohibited. Sellers remain responsible for their products, descriptions, licenses and buyer support. Account creation, store opening and listings are free. The platform commission is 5% of the sale amount, subject to the details shown before payment activation. External payment-provider fees are separate and must be disclosed before confirmation. This acceptance does not activate live payments. The platform may suspend a store for fraud, security risks or rule violations, subject to appropriate review. Withdrawal, refund, tax, governing-law, jurisdiction and operator-contact terms must be finalized and published before commercial launch.",
    notice: "Approved integration version; operator details and outstanding legal particulars must be completed and reviewed before commercial launch.",
  },
} satisfies Record<Lang, Record<string, string>>;

export function SellerLegalAcceptance({
  lang,
  privacyAccepted,
  termsAccepted,
  onPrivacyChange,
  onTermsChange,
}: Props) {
  const text = copy[lang];
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <details id="privacy-policy" className="text-sm">
        <summary className="cursor-pointer font-semibold underline">{text.privacyTitle}</summary>
        <p className="mt-3 leading-7 text-muted-foreground">{text.privacyText}</p>
      </details>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={privacyAccepted}
          onChange={(event) => onPrivacyChange(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-primary"
          required
        />
        <span>{text.privacyCheck}</span>
      </label>
      <details id="seller-terms" className="text-sm">
        <summary className="cursor-pointer font-semibold underline">{text.termsTitle}</summary>
        <p className="mt-3 leading-7 text-muted-foreground">{text.termsText}</p>
      </details>
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          checked={termsAccepted}
          onChange={(event) => onTermsChange(event.target.checked)}
          className="mt-1 size-5 shrink-0 accent-primary"
          required
        />
        <span>{text.termsCheck}</span>
      </label>
      <p className="text-xs leading-6 text-muted-foreground">{text.notice}</p>
    </div>
  );
}
