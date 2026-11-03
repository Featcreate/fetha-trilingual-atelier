import { supabase } from "@/integrations/supabase/client";
import type { Lang } from "@/lib/i18n";

export type ProductTranslationMap = Partial<Record<Lang, string>>;

export async function translateProductContent(name: string, description: string) {
  const { data, error } = await supabase.functions.invoke("translate-product", {
    body: { name, description },
  });

  if (error || !data?.nameTranslations || !data?.descriptionTranslations) {
    throw new Error("translation_failed");
  }

  return data as {
    nameTranslations: Record<Lang, string>;
    descriptionTranslations: Record<Lang, string>;
  };
}

export function localizedProductText(
  original: string,
  translations: unknown,
  lang: Lang,
): string {
  if (!translations || typeof translations !== "object" || Array.isArray(translations)) {
    return original;
  }
  const value = (translations as Record<string, unknown>)[lang];
  return typeof value === "string" && value.trim() ? value : original;
}
