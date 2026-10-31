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
    marketplace: {
      catalog: "Catalogue", sellerArea: "Espace vendeur", store: "Boutique", storeName: "Nom de la boutique", storeSlug: "Adresse courte", createStore: "Créer ma boutique gratuitement", storeExists: "Votre boutique", noStore: "Vous n'avez pas encore de boutique. Sa création est gratuite.", products: "Produits", addProduct: "Ajouter un produit", productName: "Nom du produit", description: "Description", price: "Prix (TND)", productType: "Type de produit", digitalFile: "Fichier numérique", upload: "Téléverser et publier", publishing: "Enregistrement…", active: "Publié", draft: "Brouillon", pause: "Masquer", publish: "Publier", orders: "Commandes", noProducts: "Aucun produit pour le moment.", noOrders: "Aucune commande pour le moment.", noCatalog: "Aucun produit disponible pour le moment.", search: "Rechercher un produit ou une boutique", allTypes: "Tous les types", ebook: "Livre numérique", template: "Modèle", printable: "Fichier imprimable", planner: "Planificateur", course: "Cours", software: "Logiciel / application", audio: "Audio", video: "Vidéo", graphics: "Graphismes", other: "Autre", pdf: "PDF", educational: "Ressource éducative", bundle: "Pack / lot", app: "Application", worksheets: "Fiches d'exercices", flashcards: "Cartes mémoire", digitalFiles: "Fichiers numériques", addFiles: "Ajouter des fichiers", commissionDisclosure: "Commission actuelle de la plateforme : {value} par vente réussie.", commissionUnset: "La commission de la plateforme n'est pas encore configurée. Les produits peuvent être préparés, mais les commandes resteront désactivées.", fileLimit: "Fichier accepté jusqu'à 50 Mo. Les fichiers restent privés.", freeForever: "Ouverture de boutique et ajout de produits gratuits.", sales: "Ventes", sellerNet: "Montant vendeur", commission: "Commission plateforme", orderDate: "Date", orderStatus: "Statut", pending: "En attente", paid: "Payée", failed: "Échouée", cancelled: "Annulée", storePublic: "Voir la boutique", viewCatalog: "Parcourir le catalogue", viewStore: "Voir la boutique", purchaseUnavailable: "L'achat en ligne sera disponible après l'activation sécurisée des paiements.", save: "Enregistrer", loading: "Chargement…", error: "Une erreur est survenue. Réessayez.", invalidFile: "Choisissez un fichier numérique valide de 50 Mo maximum.", invalidPrice: "Saisissez un prix valide supérieur à zéro.", slugHint: "Lettres minuscules, chiffres et tirets.", cancel: "Annuler", editStore: "Modifier le nom du magasin", storeCreated: "Votre boutique est créée.", productCreated: "Produit enregistré et publié.", productUpdated: "Produit mis à jour.", fileUploadFailed: "Le fichier n'a pas pu être téléversé. Le produit reste en brouillon.", nameRequired: "Saisissez le nom de la boutique.", productRequired: "Saisissez le nom et la description du produit.", noCommission: "Les commandes sont temporairement indisponibles tant que la commission de la plateforme n'est pas configurée.", myOrders: "Mes commandes", download: "Télécharger", downloadsLeft: "Téléchargements restants", expires: "Expire le", downloadError: "Téléchargement indisponible ou quota atteint.", tndNote: "Les prix sont actuellement affichés en TND. Les paiements réels ne sont pas activés."
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
      acceptTermsPrefix: "J’ai lu et j’accepte les", termsLink: "conditions d’utilisation",
      errTerms: "Veuillez accepter les conditions d’utilisation pour créer un compte.",
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
    marketplace: {
      catalog: "الكتالوج", sellerArea: "مساحة البائع", store: "المتجر", storeName: "اسم المتجر", storeSlug: "الرابط المختصر", createStore: "إنشاء متجري مجاناً", storeExists: "متجرك", noStore: "ليس لديك متجر بعد. إنشاء المتجر مجاني.", products: "المنتجات", addProduct: "إضافة منتج", productName: "اسم المنتج", description: "الوصف", price: "السعر (د.ت)", productType: "نوع المنتج", digitalFile: "الملف الرقمي", upload: "رفع ونشر المنتج", publishing: "جارٍ الحفظ…", active: "منشور", draft: "مسودة", pause: "إخفاء", publish: "نشر", orders: "الطلبات", noProducts: "لا توجد منتجات بعد.", noOrders: "لا توجد طلبات بعد.", noCatalog: "لا توجد منتجات متاحة حالياً.", search: "ابحث عن منتج أو متجر", allTypes: "كل الأنواع", ebook: "كتاب إلكتروني", template: "قالب", printable: "ملف قابل للطباعة", planner: "مخطط", course: "دورة", software: "برنامج / تطبيق", audio: "صوت", video: "فيديو", graphics: "تصاميم ورسومات", other: "أخرى", pdf: "ملف PDF", educational: "مورد تعليمي", bundle: "حزمة منتجات", app: "تطبيق", worksheets: "أوراق عمل", flashcards: "بطاقات تعليمية", digitalFiles: "الملفات الرقمية", addFiles: "إضافة ملفات", commissionDisclosure: "عمولة المنصة الحالية: {value} عن كل عملية بيع ناجحة.", commissionUnset: "لم يتم ضبط عمولة المنصة بعد. يمكنك تجهيز المنتجات، لكن الطلبات ستبقى متوقفة.", fileLimit: "الملف المقبول حتى 50 ميغابايت. تبقى الملفات خاصة.", freeForever: "إنشاء المتجر وإضافة المنتجات مجانيان.", sales: "المبيعات", sellerNet: "مستحقات البائع", commission: "عمولة المنصة", orderDate: "التاريخ", orderStatus: "الحالة", pending: "قيد الانتظار", paid: "مدفوع", failed: "فشل", cancelled: "ملغى", storePublic: "عرض المتجر", viewCatalog: "تصفح الكتالوج", viewStore: "عرض المتجر", purchaseUnavailable: "سيصبح الشراء متاحاً بعد تفعيل وسائل الدفع بشكل آمن.", save: "حفظ", loading: "جارٍ التحميل…", error: "حدث خطأ. حاول مرة أخرى.", invalidFile: "اختر ملفاً رقمياً صالحاً لا يتجاوز 50 ميغابايت.", invalidPrice: "أدخل سعراً صحيحاً أكبر من صفر.", slugHint: "أحرف لاتينية صغيرة وأرقام وشرطات فقط.", cancel: "إلغاء", editStore: "تعديل اسم المتجر", storeCreated: "تم إنشاء متجرك.", productCreated: "تم حفظ المنتج ونشره.", productUpdated: "تم تحديث المنتج.", fileUploadFailed: "تعذر رفع الملف. بقي المنتج مسودة.", nameRequired: "أدخل اسم المتجر.", productRequired: "أدخل اسم المنتج ووصفه.", noCommission: "الطلبات متوقفة مؤقتاً إلى أن يتم ضبط عمولة المنصة.", myOrders: "طلباتي", download: "تنزيل", downloadsLeft: "التنزيلات المتبقية", expires: "تنتهي في", downloadError: "التنزيل غير متاح أو تم استنفاد العدد المسموح.", tndNote: "تُعرض الأسعار حالياً بالدينار التونسي. الدفع الحقيقي غير مفعل."
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
      acceptTermsPrefix: "قرأت وأوافق على", termsLink: "شروط الاستخدام",
      errTerms: "يرجى الموافقة على شروط الاستخدام لإنشاء الحساب.",
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
    marketplace: {
      catalog: "Catalog", sellerArea: "Seller area", store: "Store", storeName: "Store name", storeSlug: "Short address", createStore: "Create my free store", storeExists: "Your store", noStore: "You don't have a store yet. Store creation is free.", products: "Products", addProduct: "Add product", productName: "Product name", description: "Description", price: "Price (TND)", productType: "Product type", digitalFile: "Digital file", upload: "Upload and publish", publishing: "Saving…", active: "Published", draft: "Draft", pause: "Hide", publish: "Publish", orders: "Orders", noProducts: "No products yet.", noOrders: "No orders yet.", noCatalog: "No products are available yet.", search: "Search products or stores", allTypes: "All types", ebook: "E-book", template: "Template", printable: "Printable", planner: "Planner", course: "Course", software: "Software / app", audio: "Audio", video: "Video", graphics: "Graphics", other: "Other", pdf: "PDF", educational: "Educational resource", bundle: "Bundle", app: "App", worksheets: "Worksheets", flashcards: "Flashcards", digitalFiles: "Digital files", addFiles: "Add files", commissionDisclosure: "Current platform commission: {value} per successful sale.", commissionUnset: "The platform commission is not configured yet. Products can be prepared, but orders will remain disabled.", fileLimit: "Files up to 50 MB. Files remain private.", freeForever: "Store creation and product listings are free.", sales: "Sales", sellerNet: "Seller proceeds", commission: "Platform commission", orderDate: "Date", orderStatus: "Status", pending: "Pending", paid: "Paid", failed: "Failed", cancelled: "Cancelled", storePublic: "View store", viewCatalog: "Browse catalog", viewStore: "View store", purchaseUnavailable: "Online purchases will be available after secure payment activation.", save: "Save", loading: "Loading…", error: "Something went wrong. Please try again.", invalidFile: "Choose a valid digital file no larger than 50 MB.", invalidPrice: "Enter a valid price greater than zero.", slugHint: "Lowercase letters, numbers, and hyphens.", cancel: "Cancel", editStore: "Edit store name", storeCreated: "Your store has been created.", productCreated: "Product saved and published.", productUpdated: "Product updated.", fileUploadFailed: "The file could not be uploaded. The product remains a draft.", nameRequired: "Enter a store name.", productRequired: "Enter the product name and description.", noCommission: "Orders are temporarily unavailable until the platform commission is configured.", myOrders: "My orders", download: "Download", downloadsLeft: "Downloads left", expires: "Expires", downloadError: "Download unavailable or quota exhausted.", tndNote: "Prices are currently shown in TND. Live payments are not enabled."
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
      acceptTermsPrefix: "I have read and accept the", termsLink: "Terms of Use",
      errTerms: "Please accept the Terms of Use to create an account.",
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
