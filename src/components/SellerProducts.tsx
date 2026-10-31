import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

type Store = { id: string; name: string; status: "active" | "suspended" };
type Product = { id: string; name: string; description: string; price_millimes: number; product_type: string; is_active: boolean; created_at: string };

const TYPES = ["ebook", "template", "printable", "planner", "course", "software", "audio", "video", "graphics", "other"] as const;

export function SellerProducts({ userId }: { userId: string }) {
  const { lang } = useLang();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [productType, setProductType] = useState<(typeof TYPES)[number]>("other");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const copy = {
    fr: {
      title: "Mes produits", intro: "Préparez vos fiches produits. Elles seront enregistrées comme brouillons, sans être publiées.",
      newProduct: "Ajouter un produit", name: "Nom du produit", description: "Description", price: "Prix (TND)",
      type: "Type de produit", save: "Enregistrer le brouillon", saving: "Enregistrement…",
      loading: "Chargement…", empty: "Aucun produit pour le moment.", draft: "Brouillon non publié",
      active: "Publié", failed: "Impossible d’enregistrer le produit. Vérifiez les champs et réessayez.",
      success: "Brouillon enregistré. Aucun produit n’a été publié.", invalid: "Saisissez un nom, un prix positif avec au maximum 3 décimales et une description de 5 000 caractères maximum.",
      types: { ebook: "Livre numérique", template: "Modèle", printable: "À imprimer", planner: "Planificateur", course: "Cours", software: "Logiciel", audio: "Audio", video: "Vidéo", graphics: "Graphisme", other: "Autre" },
    },
    ar: {
      title: "منتجاتي", intro: "أعدّي بيانات منتجاتك. ستحفظ كمسودات ولن تُنشر.",
      newProduct: "إضافة منتج", name: "اسم المنتج", description: "الوصف", price: "السعر (دينار تونسي)",
      type: "نوع المنتج", save: "حفظ كمسودة", saving: "جارٍ الحفظ…",
      loading: "جارٍ التحميل…", empty: "لا توجد منتجات حالياً.", draft: "مسودة غير منشورة",
      active: "منشور", failed: "تعذر حفظ المنتج. تحققي من البيانات وحاولي مجدداً.",
      success: "تم حفظ المسودة. لم يتم نشر أي منتج.", invalid: "أدخلي اسماً وسعراً موجباً بثلاث خانات عشرية كحد أقصى، ووصفاً لا يتجاوز 5000 حرف.",
      types: { ebook: "كتاب إلكتروني", template: "قالب", printable: "ملف للطباعة", planner: "مخطط", course: "دورة", software: "برنامج", audio: "صوتيات", video: "فيديو", graphics: "تصميمات", other: "أخرى" },
    },
    en: {
      title: "My products", intro: "Prepare your product listings. They will be saved as drafts and will not be published.",
      newProduct: "Add a product", name: "Product name", description: "Description", price: "Price (TND)",
      type: "Product type", save: "Save draft", saving: "Saving…",
      loading: "Loading…", empty: "No products yet.", draft: "Unpublished draft",
      active: "Published", failed: "Could not save the product. Check the fields and try again.",
      success: "Draft saved. No product has been published.", invalid: "Enter a name, a positive price with up to 3 decimal places, and a description up to 5,000 characters.",
      types: { ebook: "Ebook", template: "Template", printable: "Printable", planner: "Planner", course: "Course", software: "Software", audio: "Audio", video: "Video", graphics: "Graphics", other: "Other" },
    },
  }[lang];

  const stores = useQuery({
    queryKey: ["seller-stores", userId],
    queryFn: async () => {
      const { data, error } = await supabase.from("stores").select("id, name, status").eq("owner_id", userId);
      if (error) throw error;
      return (data ?? []) as Store[];
    },
  });
  const activeStore = stores.data?.find((store) => store.status === "active");
  const products = useQuery({
    queryKey: ["seller-products", userId, activeStore?.id],
    enabled: Boolean(activeStore?.id),
    queryFn: async () => {
      const { data, error } = await supabase.from("products")
        .select("id, name, description, price_millimes, product_type, is_active, created_at")
        .eq("store_id", activeStore!.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanName = name.trim();
    const cleanDescription = description.trim();
    const parsed = /^\d+(?:\.\d{1,3})?$/.test(price.trim()) ? Math.round(Number(price) * 1000) : 0;
    if (!activeStore || !cleanName || cleanName.length > 160 || cleanDescription.length > 5000 || !Number.isSafeInteger(parsed) || parsed <= 0) {
      setFeedback({ ok: false, text: copy.invalid });
      return;
    }
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.from("products").insert({
      store_id: activeStore.id,
      name: cleanName,
      description: cleanDescription,
      price_millimes: parsed,
      product_type: productType,
      is_active: false,
    });
    setBusy(false);
    if (error) {
      setFeedback({ ok: false, text: copy.failed });
      return;
    }
    setName("");
    setDescription("");
    setPrice("");
    setProductType("other");
    setFeedback({ ok: true, text: copy.success });
    await queryClient.invalidateQueries({ queryKey: ["seller-products", userId] });
  }

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5 sm:p-6">
      <h2 className="text-xl font-bold">{copy.title}</h2>
      <p className="mt-2 text-base text-muted-foreground">{copy.intro}</p>
      {stores.isPending ? <p className="mt-4 text-base text-muted-foreground">{copy.loading}</p> :
       stores.isError ? <p role="alert" className="mt-4 text-sm text-destructive">{copy.failed}</p> :
       !activeStore ? <p className="mt-4 rounded-xl bg-secondary p-4 text-sm">{copy.empty}</p> : (
        <>
          <form onSubmit={saveDraft} className="mt-5 space-y-4">
            <h3 className="font-semibold">{copy.newProduct}</h3>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">{copy.name}</span>
              <input required maxLength={160} value={name} onChange={(e) => setName(e.target.value)}
                className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base" />
            </label>
            <label className="block space-y-2">
              <span className="text-sm font-semibold">{copy.description}</span>
              <textarea maxLength={5000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
                className="w-full rounded-xl border border-input bg-background p-4 text-base" />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="text-sm font-semibold">{copy.price}</span>
                <input required inputMode="decimal" placeholder="12.500" value={price} onChange={(e) => setPrice(e.target.value)}
                  className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base" dir="ltr" />
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-semibold">{copy.type}</span>
                <select value={productType} onChange={(e) => setProductType(e.target.value as (typeof TYPES)[number])}
                  className="h-12 w-full rounded-xl border border-input bg-background px-4 text-base">
                  {TYPES.map((type) => <option key={type} value={type}>{copy.types[type]}</option>)}
                </select>
              </label>
            </div>
            {feedback && <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{feedback.text}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60">
              {busy ? copy.saving : copy.save}
            </button>
          </form>
          <div className="mt-8 space-y-3">
            {products.isPending ? <p className="text-sm text-muted-foreground">{copy.loading}</p> :
             products.isError ? <p role="alert" className="text-sm text-destructive">{copy.failed}</p> :
             products.data.length === 0 ? <p className="text-sm text-muted-foreground">{copy.empty}</p> :
             products.data.map((product) => (
              <article key={product.id} className="rounded-xl border border-border p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h4 className="font-semibold">{product.name}</h4>
                  <span className="rounded-full bg-secondary px-3 py-1 text-xs font-semibold">{product.is_active ? copy.active : copy.draft}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{product.description}</p>
                <p className="mt-2 text-sm font-semibold" dir="ltr">{(product.price_millimes / 1000).toFixed(3)} TND</p>
              </article>
             ))}
          </div>
        </>
       )}
    </section>
  );
}
