import { useEffect, useState } from "react";

export type Lang = "fr" | "ar" | "en";
export const LANGS: Lang[] = ["fr", "ar", "en"];
export const DEFAULT_LANG: Lang = "fr";
export const STORAGE_KEY = "fethacreate.lang";

export const dirFor = (lang: Lang) => (lang === "ar" ? "rtl" : "ltr");

export const dict = {
  fr: {
    langName: "Français",
    nav: { home: "Accueil", products: "Produits", about: "À propos", contact: "Contact" },
    menu: "Menu",
    heroKicker: "Apprendre · Créer · S'épanouir",
    heroTitle: "Des ressources numériques créatives et multilingues",
    heroText: "FethaCreate prépare une boutique de produits numériques éducatifs et créatifs.",
    heroCta: "Voir l'aperçu",
    showcaseTitle: "Aperçu des futurs produits",
    showcaseNote: "Aperçu visuel uniquement — les produits ne sont pas encore disponibles.",
    comingSoon: "Bientôt",
    preview: "Aperçu",
    footer: "Tous droits réservés.",
    logoSlot: "Emplacement du logo",
  },
  ar: {
    langName: "العربية",
    nav: { home: "الرئيسية", products: "المنتجات", about: "من نحن", contact: "اتصل بنا" },
    menu: "القائمة",
    heroKicker: "تعلّم · أبدع · ازدهر",
    heroTitle: "موارد رقمية إبداعية ومتعددة اللغات",
    heroText: "تُحضّر FethaCreate متجراً لمنتجات رقمية تعليمية وإبداعية.",
    heroCta: "شاهد المعاينة",
    showcaseTitle: "معاينة المنتجات القادمة",
    showcaseNote: "معاينة بصرية فقط — المنتجات غير متاحة بعد.",
    comingSoon: "قريباً",
    preview: "معاينة",
    footer: "جميع الحقوق محفوظة.",
    logoSlot: "مكان الشعار",
  },
  en: {
    langName: "English",
    nav: { home: "Home", products: "Products", about: "About", contact: "Contact" },
    menu: "Menu",
    heroKicker: "Learn · Create · Flourish",
    heroTitle: "Creative, multilingual digital resources",
    heroText: "FethaCreate is preparing a store for educational and creative digital products.",
    heroCta: "See the preview",
    showcaseTitle: "Preview of upcoming products",
    showcaseNote: "Visual preview only — products are not available yet.",
    comingSoon: "Coming soon",
    preview: "Preview",
    footer: "All rights reserved.",
    logoSlot: "Logo slot",
  },
} as const;

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
