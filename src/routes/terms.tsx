import { createFileRoute, Link } from "@tanstack/react-router";
import { useLang, type Lang } from "@/lib/i18n";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Use — Algorea Bazaar" }, { name: "robots", content: "noindex" }],
  }),
  component: TermsPage,
});

const copy: Record<
  Lang,
  {
    title: string;
    back: string;
    version: string;
    updated: string;
    notice: string;
    signup: string;
    sections: [string, string][];
  }
> = {
  ar: {
    title: "شروط وأحكام استخدام منصة Algorea Bazaar",
    back: "العودة إلى Algorea Bazaar",
    version: "الإصدار 2026-10-31-v2",
    updated: "آخر تحديث: 31 أكتوبر 2026",
    notice:
      "هذه ترجمة موحدة للشروط بثلاث لغات. يجب استكمال بيانات الجهة المشغلة ومراجعة النصوص قانونياً قبل الإطلاق التجاري أو الدولي.",
    signup: "إنشاء حساب",
    sections: [
      [
        "1. مقدمة ونطاق الاستخدام",
        "تحدد هذه الشروط قواعد استخدام Algorea Bazaar، وهي سوق إلكترونية للمنتجات الرقمية القابلة للتنزيل، مثل الكتب الإلكترونية والملفات التعليمية والقوالب والتطبيقات والبرامج. يُعد إنشاء حساب أو استخدام المنصة موافقة على هذه الشروط.",
      ],
      [
        "2. طبيعة المنصة",
        "توفر المنصة مساحة رقمية لعرض المنتجات الرقمية وبيعها وشرائها. يبقى البائع مسؤولاً عن منتجاته ومحتواها وحقوق بيعها، ويلتزم المشتري بترخيص المنتج وشروط استخدامه.",
      ],
      [
        "3. الحسابات",
        "يلتزم المستخدم بتقديم معلومات صحيحة والمحافظة على سرية بيانات الدخول وعدم انتحال هوية الغير. ويتحمل مسؤولية الأنشطة التي تتم من خلال حسابه وفق القانون.",
      ],
      [
        "4. تسجيل البائعين والمتاجر",
        "التسجيل كبائع وإنشاء متجر وإضافة المنتجات مجاني بشكل دائم، دون رسوم تسجيل أو فتح متجر أو إدراج منتجات أو اشتراك إلزامي.",
      ],
      [
        "5. مسؤوليات البائع",
        "يتحمل البائع مسؤولية قانونية منتجاته وامتلاكه حقوق بيعها، وصحة وصفها ومحتواها وسعرها، واحترام الملكية الفكرية، وتوفير ملفات مطابقة للوصف وخالية من المحتوى الضار أو المخالف.",
      ],
      [
        "6. المنتجات والتراخيص",
        "تُباع منتجات رقمية فقط ولا يوجد شحن مادي. يمنح الشراء حق الاستخدام وفق الترخيص المحدد. ولا يجوز النسخ أو إعادة البيع أو التوزيع أو النشر دون إذن، إلا إذا سمح الترخيص أو القانون.",
      ],
      [
        "7. الطلبات والدفع",
        "تُنفذ الطلبات إلكترونياً عبر وسائل الدفع التي تتيحها المنصة. يعرض مزود الدفع رسوم وسيلة الدفع الخاصة به ضمن واجهته، ولا تُفعّل وسيلة دفع إلا بعد التحقق من شروطها وإمكانية استخدامها قانونياً.",
      ],
      [
        "8. عمولة المنصة ومستحقات البائع",
        "تقتطع المنصة عمولة عن كل عملية بيع ناجحة، وتُحدد قيمتها وفق السياسة المعمول بها والمعلنة على المنصة وقت إجراء العملية. يستحق البائع 95% من مبلغ البيع عند اعتماد عمولة 5%، قبل أي رسوم يفرضها مزود خدمة الاستلام أو التحويل أو السحب.",
      ],
      [
        "9. الرسوم الخارجية",
        "يتعامل المشتري مع رسوم وسيلة الدفع التي يفرضها مزود الدفع، ويتعامل البائع مع رسوم استلام مستحقاته أو تحويلها أو سحبها التي يفرضها مزود الخدمة، وفق شروط المزود والقانون. يتولى كل مزود احتساب رسومه وعرضها وتحصيلها عبر واجهته الخاصة. لا تحتسب المنصة هذه الرسوم أو تعرضها أو تديرها، ولا تتحمل أي رسوم خارجية.",
      ],
      [
        "10. التنزيل والاسترجاع",
        "يتم التنزيل وفق شروط الوصول الموضحة عند الشراء. وتُعالج طلبات الإلغاء والاسترجاع وفق طبيعة المنتج الرقمي والقوانين المعمول بها، دون إلغاء أي حق قانوني إلزامي للمستهلك.",
      ],
      [
        "11. مسؤولية المستخدمين",
        "يتحمل كل مستخدم مسؤولية أفعاله وإخلالاته. يتحمل البائع مسؤولية منتجاته وانتهاك حقوق الغير، ويتحمل المشتري مسؤولية استعمال المنتجات والحساب وفق الترخيص والقانون. لا تتحمل المنصة تبعات الأضرار الناتجة حصراً عن أفعال المستخدمين المستقلة عنها، ما لم يثبت خطأ المنصة أو إخلالها بالتزام قانوني. ويعوض المستخدم الأضرار المباشرة المثبتة التي تسبب بها للمنصة، في حدود القانون. ولا يعفي ذلك المنصة من مسؤولياتها القانونية الخاصة أو الحقوق الإلزامية للغير.",
      ],
      [
        "12. الاستخدامات الممنوعة",
        "يُمنع نشر أو بيع المحتوى غير القانوني أو المسروق أو المنتهك للملكية الفكرية، والاحتيال أو انتحال الهوية، ونشر البرمجيات الضارة، أو مخالفة الترخيص أو القانون.",
      ],
      [
        "13. الإجراءات ووقف الحسابات",
        "يجوز للمنصة إزالة المحتوى المخالف أو تعليق الحساب أو إغلاقه عند مخالفة الشروط أو القانون، والتعاون مع الجهات المختصة متى كان ذلك مطلوباً قانوناً.",
      ],
      [
        "14. البيانات والخصوصية",
        "تُعالج بيانات المستخدمين لتشغيل المنصة وتقديم خدماتها وحماية الحسابات وتنفيذ الطلبات، وفق سياسة الخصوصية والقوانين المعمول بها.",
      ],
      [
        "15. حدود المسؤولية وتوافر الخدمة",
        "تسعى المنصة إلى توفير خدمة مستقرة وآمنة، لكنها لا تضمن استمرارها دون انقطاع. ولا تتحمل مسؤولية أفعال المستخدمين المستقلة عنها، دون الإخلال بمسؤولياتها القانونية والتعاقدية أو الحقوق التي لا يجوز استبعادها قانوناً.",
      ],
      [
        "16. تعديل الشروط والقانون",
        "يجوز تحديث الشروط والإعلان عن التعديلات عبر المنصة. ويخضع الاستخدام للقوانين المعمول بها في تونس، مع مراعاة القواعد الإلزامية في دول المستخدمين.",
      ],
      [
        "17. بيانات الجهة المشغلة والتواصل",
        "الاسم القانوني والعنوان والبريد الإلكتروني الرسمي ورقم التسجيل أو المعرف الجبائي: تُستكمل قبل النشر التجاري.",
      ],
    ],
  },
  fr: {
    title: "Conditions générales d’utilisation d’Algorea Bazaar",
    back: "Retour à Algorea Bazaar",
    version: "Version 2026-10-31-v2",
    updated: "Dernière mise à jour : 31 octobre 2026",
    notice:
      "Cette version harmonise les conditions en trois langues. Les informations sur l’exploitant doivent être complétées et le texte doit faire l’objet d’une vérification juridique avant tout lancement commercial ou international.",
    signup: "Créer un compte",
    sections: [
      [
        "1. Objet et champ d’application",
        "Les présentes conditions régissent l’utilisation d’Algorea Bazaar, une place de marché de produits numériques téléchargeables, notamment des livres numériques, ressources pédagogiques, modèles, applications et logiciels. La création d’un compte ou l’utilisation de la plateforme vaut acceptation des présentes conditions.",
      ],
      [
        "2. Nature de la plateforme",
        "La plateforme fournit un espace numérique permettant de présenter, vendre et acheter des produits numériques. Le vendeur demeure responsable de ses produits, de leur contenu et des droits nécessaires à leur vente. L’acheteur respecte la licence et les conditions d’utilisation du produit.",
      ],
      [
        "3. Comptes utilisateurs",
        "L’utilisateur fournit des informations exactes, protège ses identifiants et ne se fait pas passer pour un tiers. Il est responsable des activités réalisées depuis son compte, conformément à la loi.",
      ],
      [
        "4. Inscription des vendeurs et boutiques",
        "L’inscription en tant que vendeur, l’ouverture d’une boutique et la mise en ligne de produits sont gratuites de manière permanente, sans frais d’inscription, d’ouverture, de publication ni abonnement obligatoire.",
      ],
      [
        "5. Responsabilités du vendeur",
        "Le vendeur est responsable de ses produits, de ses droits de vente, de l’exactitude de leur description, de leur contenu et de leur prix, du respect de la propriété intellectuelle et de la fourniture de fichiers conformes à la description, exempts de contenu nuisible ou illicite.",
      ],
      [
        "6. Produits et licences",
        "Seuls les produits numériques sont proposés ; aucun article physique n’est expédié. L’achat accorde un droit d’utilisation conformément à la licence indiquée. Toute copie, revente, distribution ou publication non autorisée est interdite, sauf autorisation de la licence ou de la loi.",
      ],
      [
        "7. Commandes et paiements",
        "Les commandes sont exécutées en ligne au moyen des moyens de paiement proposés par la plateforme. Le prestataire de paiement présente les frais propres au moyen de paiement dans sa propre interface. Un moyen de paiement n’est activé qu’après vérification de ses conditions et de sa disponibilité légale.",
      ],
      [
        "8. Commission de la plateforme et sommes dues au vendeur",
        "La plateforme prélève une commission sur chaque vente réussie. Son taux est celui de la politique affichée sur la plateforme au moment de la transaction. Au taux de commission de 5 %, le vendeur a droit à 95 % du montant de la vente, avant les frais éventuels facturés par le prestataire de réception, de transfert ou de retrait.",
      ],
      [
        "9. Frais externes",
        "L’acheteur prend en charge les frais facturés par le prestataire de paiement pour le moyen choisi. Le vendeur prend en charge les frais de réception, de transfert ou de retrait facturés par son prestataire, selon les conditions de celui-ci et la loi. Chaque prestataire calcule, affiche et prélève ses propres frais dans sa propre interface. La plateforme ne calcule, n’affiche ni ne gère ces frais et ne prend en charge aucun frais externe.",
      ],
      [
        "10. Téléchargement et remboursements",
        "Le téléchargement est soumis aux conditions d’accès présentées lors de l’achat. Les demandes d’annulation et de remboursement sont traitées selon la nature du produit numérique et le droit applicable, sans supprimer les droits impératifs du consommateur.",
      ],
      [
        "11. Responsabilité des utilisateurs",
        "Chaque utilisateur répond de ses actes et manquements. Le vendeur répond de ses produits et des atteintes aux droits de tiers ; l’acheteur répond de l’utilisation des produits et de son compte conformément à la licence et à la loi. La plateforme n’est pas responsable des dommages résultant exclusivement d’actes indépendants des utilisateurs, sauf faute ou manquement légal qui lui est imputable. L’utilisateur répare les dommages directs prouvés qu’il cause à la plateforme, dans les limites de la loi. Cela ne limite pas les responsabilités propres de la plateforme ni les droits impératifs des tiers.",
      ],
      [
        "12. Usages interdits",
        "Il est interdit de publier ou vendre des contenus illicites, volés ou portant atteinte à la propriété intellectuelle, de frauder, d’usurper une identité, de diffuser des logiciels malveillants ou de violer une licence ou la loi.",
      ],
      [
        "13. Mesures et suspension des comptes",
        "La plateforme peut retirer un contenu non conforme, suspendre ou clôturer un compte en cas de violation des présentes conditions ou de la loi, et coopérer avec les autorités compétentes lorsque la loi l’exige.",
      ],
      [
        "14. Données et confidentialité",
        "Les données des utilisateurs sont traitées pour exploiter la plateforme, fournir ses services, protéger les comptes et exécuter les commandes, conformément à la politique de confidentialité et au droit applicable.",
      ],
      [
        "15. Disponibilité et limites de responsabilité",
        "La plateforme s’efforce de fournir un service stable et sécurisé, sans garantir une disponibilité ininterrompue. Elle n’est pas responsable des actes indépendants des utilisateurs, sans préjudice de ses propres obligations légales et contractuelles ni des droits qui ne peuvent être exclus par la loi.",
      ],
      [
        "16. Modifications et droit applicable",
        "Les présentes conditions peuvent être mises à jour et les modifications annoncées sur la plateforme. L’utilisation est soumise au droit applicable en Tunisie, sous réserve des règles impératives applicables dans le pays de l’utilisateur.",
      ],
      [
        "17. Exploitant et contact",
        "La dénomination légale, l’adresse, l’adresse électronique officielle et le numéro d’immatriculation ou identifiant fiscal de l’exploitant doivent être renseignés avant le lancement commercial.",
      ],
    ],
  },
  en: {
    title: "Algorea Bazaar Terms of Use",
    back: "Back to Algorea Bazaar",
    version: "Version 2026-10-31-v2",
    updated: "Last updated: 31 October 2026",
    notice:
      "This version harmonizes the Terms in three languages. The operator’s legal details must be completed and the text reviewed by qualified counsel before commercial or international launch.",
    signup: "Create an account",
    sections: [
      [
        "1. Purpose and scope",
        "These Terms govern the use of Algorea Bazaar, a marketplace for downloadable digital products, including e-books, educational resources, templates, applications and software. Creating an account or using the platform constitutes acceptance of these Terms.",
      ],
      [
        "2. Nature of the platform",
        "The platform provides a digital space to display, sell and purchase digital products. Sellers remain responsible for their products, their content and the rights required to sell them. Buyers must comply with each product’s licence and terms of use.",
      ],
      [
        "3. User accounts",
        "Users must provide accurate information, protect their login credentials and must not impersonate another person. Users are responsible, as permitted by law, for activity carried out through their accounts.",
      ],
      [
        "4. Seller and store registration",
        "Seller registration, store creation and product listings are permanently free. There are no registration, store-opening or listing fees and no mandatory seller subscription.",
      ],
      [
        "5. Seller responsibilities",
        "Sellers are responsible for their products, their right to sell them, the accuracy of descriptions, content and prices, compliance with intellectual-property rights, and providing files that match the description and contain no harmful or unlawful material.",
      ],
      [
        "6. Products and licences",
        "Only digital products are offered; no physical goods are shipped. A purchase grants the right to use the product under its stated licence. Unauthorized copying, resale, distribution or publication is prohibited unless permitted by the licence or applicable law.",
      ],
      [
        "7. Orders and payments",
        "Orders are processed online using payment methods made available by the platform. The payment provider displays its own payment-method fees in its interface. A payment method is enabled only after its terms and lawful availability have been checked.",
      ],
      [
        "8. Platform commission and seller proceeds",
        "The platform deducts a commission from each successful sale. The applicable rate is the policy displayed on the platform when the transaction takes place. At the 5% commission rate, the seller is entitled to 95% of the sale amount before any receiving, transfer or withdrawal fees charged by the seller's provider.",
      ],
      [
        "9. External fees",
        "The buyer handles payment-method fees charged by the selected payment provider. The seller handles fees charged by the seller's receiving, transfer or withdrawal provider, subject to provider terms and applicable law. Each provider calculates, displays and collects its own fees in its own interface. The platform does not calculate, display, duplicate, or manage provider fees and does not bear any external fees.",
      ],
      [
        "10. Downloads and refunds",
        "Downloads are subject to the access conditions shown at purchase. Cancellation and refund requests are handled according to the nature of the digital product and applicable law, without removing any mandatory consumer rights.",
      ],
      [
        "11. User liability",
        "Each user is responsible for their own acts and breaches. Sellers are responsible for their products and infringement of third-party rights; buyers are responsible for using products and accounts in accordance with the licence and law. The platform is not liable for damage caused exclusively by users’ independent acts, unless the platform is at fault or breaches a legal duty. Users must compensate the platform for proven direct damage they cause, to the extent permitted by law. This does not exclude the platform’s own legal responsibilities or mandatory third-party rights.",
      ],
      [
        "12. Prohibited conduct",
        "Users must not publish or sell unlawful, stolen or infringing content, commit fraud, impersonate others, distribute malware, or violate a licence or applicable law.",
      ],
      [
        "13. Enforcement and account suspension",
        "The platform may remove non-compliant content, suspend or close accounts for violations of these Terms or applicable law, and cooperate with competent authorities where legally required.",
      ],
      [
        "14. Data and privacy",
        "User data is processed to operate the platform, provide its services, protect accounts and fulfil orders, in accordance with the privacy policy and applicable law.",
      ],
      [
        "15. Availability and limitation of liability",
        "The platform seeks to provide a stable and secure service but does not guarantee uninterrupted availability. It is not responsible for users’ independent acts, without limiting its own legal and contractual duties or rights that cannot lawfully be excluded.",
      ],
      [
        "16. Changes and governing law",
        "These Terms may be updated, with changes announced on the platform. Use of the platform is subject to applicable Tunisian law, while respecting mandatory rules that apply in the user’s country.",
      ],
      [
        "17. Operator details and contact",
        "The operator’s legal name, address, official email address and registration or tax identification number must be completed before commercial launch.",
      ],
    ],
  },
};

function TermsPage() {
  const { lang, setLang } = useLang();
  const text = copy[lang];
  return (
    <main
      dir={lang === "ar" ? "rtl" : "ltr"}
      lang={lang}
      className="mx-auto min-h-screen w-full max-w-4xl px-5 py-10 text-foreground sm:px-8"
    >
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Link to="/" className="text-sm font-semibold text-coral hover:underline">
          {text.back}
        </Link>
        <div className="flex items-center gap-2" aria-label="Language">
          {(["fr", "ar", "en"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setLang(value)}
              aria-pressed={lang === value}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${lang === value ? "border-coral bg-secondary" : "border-border"}`}
            >
              {value.toUpperCase()}
            </button>
          ))}
        </div>
        <span className="rounded-full bg-secondary px-3 py-1 text-xs">{text.version}</span>
      </div>
      <header className="mb-8 space-y-3">
        <h1 className="text-3xl font-bold tracking-tight">{text.title}</h1>
        <p className="text-sm text-muted-foreground">{text.updated}</p>
        <p className="rounded-xl border border-border bg-secondary/50 p-4 text-sm leading-7">
          {text.notice}
        </p>
      </header>
      <div className="space-y-7">
        {text.sections.map(([heading, body]) => (
          <section key={heading} className="space-y-2">
            <h2 className="text-lg font-semibold">{heading}</h2>
            <p className="leading-8 text-muted-foreground">{body}</p>
          </section>
        ))}
      </div>
      <footer className="mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
        <Link
          to="/auth"
          search={{ mode: "signup" }}
          className="font-semibold text-coral hover:underline"
        >
          {text.signup}
        </Link>
      </footer>
    </main>
  );
}
