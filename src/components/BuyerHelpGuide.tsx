type BuyerHelpGuideProps = { lang: "fr" | "ar" | "en" };

const guideContent = {
  fr: {
    title: "Guide d’utilisation – Algorea Bazaar",
    welcome: "Bienvenue sur Algorea Bazaar !",
    intro: "Découvrez et achetez facilement des produits numériques.",
    steps: [
      [
        "1. Choisir un produit",
        "Parcourez les catégories ou utilisez la barre de recherche pour trouver le produit qui vous intéresse.",
      ],
      [
        "2. Ajouter au panier",
        "Consultez la description du produit, son prix et les fichiers inclus, puis ajoutez-le à votre panier.",
      ],
      [
        "3. Effectuer le paiement",
        "Suivez les instructions de paiement proposées sur la plateforme. Votre commande sera vérifiée avant l'activation du téléchargement.",
      ],
      [
        "4. Télécharger votre produit",
        "Accédez à votre espace personnel, puis à la rubrique « Mes commandes ». Lorsque le bouton « Téléchargement disponible actuellement » apparaît, cliquez dessus pour télécharger votre fichier.",
      ],
      [
        "5. Besoin d’aide ?",
        "Pour toute question ou difficulté, contactez notre assistance à l’adresse : contact.algoreabazaar@gmail.com.",
      ],
    ],
    important:
      "Important : Les produits proposés sur Algorea Bazaar sont des produits numériques. Aucun produit physique ne sera expédié.",
  },
  ar: {
    title: "دليل الاستخدام – Algorea Bazaar",
    welcome: "مرحباً بك في Algorea Bazaar!",
    intro: "اكتشف المنتجات الرقمية واشترِها بسهولة.",
    steps: [
      [
        "1. اختيار المنتج",
        "تصفّح الفئات أو استخدم شريط البحث للعثور على المنتج الذي تبحث عنه.",
      ],
      [
        "2. إضافة المنتج إلى السلة",
        "اطّلع على وصف المنتج وسعره والملفات المرفقة به، ثم أضفه إلى سلتك.",
      ],
      [
        "3. إتمام الدفع",
        "اتبع تعليمات الدفع المتاحة على المنصة. ستتم مراجعة طلبك قبل تفعيل إمكانية التنزيل.",
      ],
      [
        "4. تنزيل المنتج",
        "انتقل إلى مساحتك الشخصية، ثم إلى قسم «طلباتي». عندما يظهر زر «التحميل متاح حالياً»، اضغط عليه لتنزيل ملفك.",
      ],
      [
        "5. هل تحتاج إلى مساعدة؟",
        "لأي سؤال أو صعوبة، تواصل مع فريق الدعم عبر البريد الإلكتروني: contact.algoreabazaar@gmail.com.",
      ],
    ],
    important:
      "مهم: المنتجات المعروضة على Algorea Bazaar هي منتجات رقمية. لن يتم شحن أي منتج مادي.",
  },
  en: {
    title: "User Guide – Algorea Bazaar",
    welcome: "Welcome to Algorea Bazaar!",
    intro: "Discover and purchase digital products easily.",
    steps: [
      [
        "1. Choose a product",
        "Browse the categories or use the search bar to find the product you are interested in.",
      ],
      [
        "2. Add to cart",
        "Review the product description, price, and included files, then add it to your cart.",
      ],
      [
        "3. Make the payment",
        "Follow the payment instructions provided on the platform. Your order will be checked before downloads are activated.",
      ],
      [
        "4. Download your product",
        "Go to your personal area, then open “My orders”. When the “Download available now” button appears, click it to download your file.",
      ],
      [
        "5. Need help?",
        "If you have any questions or difficulties, contact our support team at: contact.algoreabazaar@gmail.com.",
      ],
    ],
    important:
      "Important: Products offered on Algorea Bazaar are digital products. No physical product will be shipped.",
  },
} as const;

export function BuyerHelpGuide({ lang }: BuyerHelpGuideProps) {
  const guide = guideContent[lang];

  return (
    <details
      dir={lang === "ar" ? "rtl" : "ltr"}
      className="mb-5 rounded-xl border border-border bg-secondary/50 p-4"
    >
      <summary className="cursor-pointer font-semibold text-foreground">
        {guide.title}
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-6">
        <p className="font-semibold">{guide.welcome}</p>
        <p>{guide.intro}</p>
        <ol className="list-inside list-decimal space-y-3">
          {guide.steps.map(([title, text]) => (
            <li key={title}>
              <strong>{title}</strong>
              <p className="mt-1">{text}</p>
            </li>
          ))}
        </ol>
        <p className="rounded-lg bg-background/70 p-3 text-xs font-medium">
          {guide.important}
        </p>
      </div>
    </details>
  );
}
