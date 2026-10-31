import { useEffect, useState } from "react";

export type Lang = "fr" | "ar" | "en";
export const LANGS: Lang[] = ["fr", "ar", "en"];
export const DEFAULT_LANG: Lang = "fr";
export const STORAGE_KEY = "algoreabazaar.lang";

export const dirFor = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

export const dict = {
  fr: {
    langName: "Français",
    nav: { home: "Accueil", products: "Produits", about: "À propos", contact: "Contact" },
    menu: "Menu",
    heroKicker: "Apprendre · Créer · S'épanouir",
    heroTitle: "Des ressources numériques créatives et multilingues",
    heroText: "Algorea Bazaar prépare une boutique de produits numériques éducatifs et créatifs.",
    heroCta: "Voir l'aperçu",
    showcaseTitle: "Aperçu des futurs produits",
    showcaseNote: "Aperçu visuel uniquement — les produits ne sont pas encore disponibles.",
    comingSoon: "Bientôt",
    preview: "Aperçu",
    footer: "Tous droits réservés.",
    logoSlot: "Emplacement du logo",
    catalog: {
      title: "La marketplace Algorea Bazaar",
      subtitle: "Découvrez des produits numériques créés par des vendeurs indépendants : livres, modèles, ressources éducatives, logiciels et bien plus.",
      sellerFree: "Créer une boutique et publier des produits restera gratuit pour les vendeurs.",
      browse: "Parcourir les produits",
      search: "Rechercher un produit…",
      allTypes: "Tous les types",
      loading: "Chargement des produits…",
      loadError: "Impossible de charger les produits pour le moment. Réessayez plus tard.",
      emptyTitle: "La marketplace se prépare",
      emptyText: "Aucun produit n'est encore publié. Revenez bientôt pour découvrir les premières créations.",
      noMatch: "Aucun produit ne correspond à votre recherche.",
      store: "Boutique",
      price: "Prix",
      types: {
        ebook: "Livre numérique",
        template: "Modèle",
        printable: "À imprimer",
        planner: "Planificateur",
        course: "Cours",
        software: "Logiciel",
        audio: "Audio",
        video: "Vidéo",
        graphics: "Graphisme",
        other: "Autre",
      },
    },
    auth: {
      signIn: "Connexion", signUp: "Créer un compte", signOut: "Se déconnecter", account: "Mon compte",
      email: "E-mail", password: "Mot de passe", newPassword: "Nouveau mot de passe", fullName: "Nom complet", phone: "Téléphone",
      signInTitle: "Connexion à votre compte", signUpTitle: "Créer votre compte client",
      noAccount: "Pas encore de compte ?", haveAccount: "Déjà un compte ?",
      forgot: "Mot de passe oublié ?", forgotTitle: "Réinitialiser le mot de passe", sendReset: "Envoyer le lien",
      resetSent: "Si un compte existe pour cet e-mail, un lien de réinitialisation a été envoyé.",
      resetTitle: "Choisir un nouveau mot de passe", resetSave: "Enregistrer le mot de passe", resetDone: "Mot de passe mis à jour.",
      resetInvalid: "Lien invalide ou expiré. Demandez un nouveau lien.",
      checkEmail: "Compte créé. Vérifiez votre e-mail pour confirmer votre adresse, puis connectez-vous.",
      loading: "Veuillez patienter…", save: "Enregistrer", saved: "Profil enregistré.",
      memberSince: "Client depuis", profileTitle: "Mes informations", back: "Retour à l'accueil",
      errName: "Saisissez votre nom complet (2 à 120 caractères).", errPhone: "Numéro de téléphone invalide.",
      errEmail: "Adresse e-mail invalide.", errPassword: "Le mot de passe doit contenir au moins 8 caractères.",
      errCredentials: "E-mail ou mot de passe incorrect.", errUnconfirmed: "Confirmez d'abord votre e-mail.",
      errExists: "Un compte existe déjà avec cet e-mail.", errWeak: "Mot de passe trop faible ou compromis, choisissez-en un autre.",
      errRate: "Trop de tentatives. Réessayez plus tard.", errGeneric: "Une erreur est survenue. Réessayez.",
    },
  },
  ar: {
    langName: "العربية",
    nav: { home: "الرئيسية", products: "المنتجات", about: "من نحن", contact: "اتصل بنا" },
    menu: "القائمة",
    heroKicker: "تعلّم · أبدع · ازدهر",
    heroTitle: "موارد رقمية إبداعية ومتعددة اللغات",
    heroText: "تُحضّر Algorea Bazaar متجراً لمنتجات رقمية تعليمية وإبداعية.",
    heroCta: "شاهد المعاينة",
    showcaseTitle: "معاينة المنتجات القادمة",
    showcaseNote: "معاينة بصرية فقط — المنتجات غير متاحة بعد.",
    comingSoon: "قريباً",
    preview: "معاينة",
    footer: "جميع الحقوق محفوظة.",
    logoSlot: "مكان الشعار",
    catalog: {
      title: "سوق Algorea Bazaar",
      subtitle: "اكتشف منتجات رقمية من إبداع بائعين مستقلين: كتب إلكترونية، قوالب، موارد تعليمية، برامج والمزيد.",
      sellerFree: "سيظل إنشاء المتجر ونشر المنتجات مجانياً للبائعين.",
      browse: "تصفح المنتجات",
      search: "ابحث عن منتج…",
      allTypes: "كل الأنواع",
      loading: "جارٍ تحميل المنتجات…",
      loadError: "تعذر تحميل المنتجات حالياً. حاول مرة أخرى لاحقاً.",
      emptyTitle: "السوق قيد التحضير",
      emptyText: "لم تُنشر أي منتجات بعد. عُد قريباً لاكتشاف الإبداعات الأولى.",
      noMatch: "لا توجد منتجات تطابق بحثك.",
      store: "المتجر",
      price: "السعر",
      types: {
        ebook: "كتاب إلكتروني",
        template: "قالب",
        printable: "ملف للطباعة",
        planner: "مخطط",
        course: "دورة",
        software: "برنامج",
        audio: "صوتيات",
        video: "فيديو",
        graphics: "تصميمات",
        other: "أخرى",
      },
    },
    auth: {
      signIn: "تسجيل الدخول", signUp: "إنشاء حساب", signOut: "تسجيل الخروج", account: "حسابي",
      email: "البريد الإلكتروني", password: "كلمة المرور", newPassword: "كلمة المرور الجديدة", fullName: "الاسم الكامل", phone: "رقم الهاتف",
      signInTitle: "تسجيل الدخول إلى حسابك", signUpTitle: "إنشاء حساب عميل",
      noAccount: "ليس لديك حساب؟", haveAccount: "لديك حساب بالفعل؟",
      forgot: "نسيت كلمة المرور؟", forgotTitle: "إعادة تعيين كلمة المرور", sendReset: "إرسال الرابط",
      resetSent: "إذا كان هناك حساب بهذا البريد، فقد أُرسل رابط إعادة التعيين.",
      resetTitle: "اختر كلمة مرور جديدة", resetSave: "حفظ كلمة المرور", resetDone: "تم تحديث كلمة المرور.",
      resetInvalid: "الرابط غير صالح أو منتهي الصلاحية. اطلب رابطاً جديداً.",
      checkEmail: "تم إنشاء الحساب. تحقق من بريدك الإلكتروني لتأكيد العنوان ثم سجّل الدخول.",
      loading: "يرجى الانتظار…", save: "حفظ", saved: "تم حفظ الملف الشخصي.",
      memberSince: "عميل منذ", profileTitle: "معلوماتي", back: "العودة إلى الرئيسية",
      errName: "أدخل اسمك الكامل (من 2 إلى 120 حرفاً).", errPhone: "رقم الهاتف غير صالح.",
      errEmail: "البريد الإلكتروني غير صالح.", errPassword: "يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل.",
      errCredentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", errUnconfirmed: "يرجى تأكيد بريدك الإلكتروني أولاً.",
      errExists: "يوجد حساب بهذا البريد الإلكتروني.", errWeak: "كلمة المرور ضعيفة أو مسرّبة، اختر كلمة أخرى.",
      errRate: "محاولات كثيرة. حاول لاحقاً.", errGeneric: "حدث خطأ. حاول مرة أخرى.",
    },
  },
  en: {
    langName: "English",
    nav: { home: "Home", products: "Products", about: "About", contact: "Contact" },
    menu: "Menu",
    heroKicker: "Learn · Create · Flourish",
    heroTitle: "Creative, multilingual digital resources",
    heroText: "Algorea Bazaar is preparing a store for educational and creative digital products.",
    heroCta: "See the preview",
    showcaseTitle: "Preview of upcoming products",
    showcaseNote: "Visual preview only — products are not available yet.",
    comingSoon: "Coming soon",
    preview: "Preview",
    footer: "All rights reserved.",
    logoSlot: "Logo slot",
    catalog: {
      title: "The Algorea Bazaar marketplace",
      subtitle: "Discover digital products from independent sellers: ebooks, templates, educational resources, software, and more.",
      sellerFree: "Opening a store and publishing products will remain free for sellers.",
      browse: "Browse products",
      search: "Search products…",
      allTypes: "All types",
      loading: "Loading products…",
      loadError: "Products could not be loaded right now. Please try again later.",
      emptyTitle: "The marketplace is getting ready",
      emptyText: "No products have been published yet. Check back soon for the first creations.",
      noMatch: "No products match your search.",
      store: "Store",
      price: "Price",
      types: {
        ebook: "Ebook",
        template: "Template",
        printable: "Printable",
        planner: "Planner",
        course: "Course",
        software: "Software",
        audio: "Audio",
        video: "Video",
        graphics: "Graphics",
        other: "Other",
      },
    },
    auth: {
      signIn: "Sign in", signUp: "Create account", signOut: "Sign out", account: "My account",
      email: "Email", password: "Password", newPassword: "New password", fullName: "Full name", phone: "Phone",
      signInTitle: "Sign in to your account", signUpTitle: "Create your customer account",
      noAccount: "No account yet?", haveAccount: "Already have an account?",
      forgot: "Forgot password?", forgotTitle: "Reset your password", sendReset: "Send reset link",
      resetSent: "If an account exists for this email, a reset link has been sent.",
      resetTitle: "Choose a new password", resetSave: "Save password", resetDone: "Password updated.",
      resetInvalid: "Invalid or expired link. Request a new one.",
      checkEmail: "Account created. Check your email to confirm your address, then sign in.",
      loading: "Please wait…", save: "Save", saved: "Profile saved.",
      memberSince: "Customer since", profileTitle: "My details", back: "Back to home",
      errName: "Enter your full name (2 to 120 characters).", errPhone: "Invalid phone number.",
      errEmail: "Invalid email address.", errPassword: "Password must be at least 8 characters.",
      errCredentials: "Incorrect email or password.", errUnconfirmed: "Please confirm your email first.",
      errExists: "An account already exists with this email.", errWeak: "Password is too weak or leaked, choose another.",
      errRate: "Too many attempts. Try again later.", errGeneric: "Something went wrong. Please try again.",
    },
  },
} as const;

export type AuthDict = Record<keyof (typeof dict)["fr"]["auth"], string>;

/** Map auth provider errors to a translated, user-safe message. */
export function authErrorMessage(t: AuthDict, err: { message?: string | undefined; code?: string | undefined; status?: number | undefined } | null) {
  const m = `${err?.code ?? ""} ${err?.message ?? ""}`.toLowerCase();
  if (m.includes("invalid_credentials") || m.includes("invalid login")) return t.errCredentials;
  if (m.includes("not_confirmed") || m.includes("not confirmed")) return t.errUnconfirmed;
  if (m.includes("already") || m.includes("user_exists")) return t.errExists;
  if (m.includes("weak") || m.includes("pwned")) return t.errWeak;
  if (err?.status === 429 || m.includes("rate")) return t.errRate;
  return t.errGeneric;
}

export function useLang() {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Lang | null;
    if (saved && LANGS.includes(saved)) setLangState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = dirFor(lang);
  }, [lang]);

  const setLang = (l: Lang) => {
    localStorage.setItem(STORAGE_KEY, l);
    setLangState(l);
  };

  return { lang, setLang, t: dict[lang] };
}
