import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

type Store = { id: string; name: string; slug: string; status: "active" | "suspended" };

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
    },
    ar: {
      title: "متجري", intro: "أنشئي متجرك مجاناً على Algorea Bazaar.",
      name: "اسم المتجر", slug: "رابط المتجر", create: "إنشاء متجري",
      loading: "جارٍ التحميل…", active: "المتجر نشط", suspended: "المتجر موقوف",
      address: "المعرّف", confirm: "يرجى تأكيد بريدك الإلكتروني قبل إنشاء المتجر.",
      invalid: "يجب أن يتراوح اسم المتجر بين حرف و120 حرفاً، وأن يتكون الرابط من 3 إلى 50 حرفاً صغيراً أو رقماً أو شرطة.",
      failed: "تعذر إنشاء المتجر. جرّبي رابطاً آخر أو أعيدي المحاولة.",
      success: "تم إنشاء متجرك بنجاح.", free: "إنشاء المتجر وإدارته مجانيان.",
    },
    en: {
      title: "My store", intro: "Open your store on Algorea Bazaar for free.",
      name: "Store name", slug: "Store address", create: "Create my store",
      loading: "Loading…", active: "Store active", suspended: "Store suspended",
      address: "Slug", confirm: "Confirm your email address before opening a store.",
      invalid: "Store name must be 1–120 characters. Address must be 3–50 lowercase letters, numbers, or hyphens.",
      failed: "Could not create the store. Try another address or try again.",
      success: "Your store was created.", free: "Store creation and management are free.",
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
    if (!emailConfirmed || (stores.data?.length ?? 0) > 0) return;
    setBusy(true);
    setFeedback(null);
    const { error } = await supabase.from("stores").insert({
      owner_id: userId, name: cleanName, slug: cleanSlug, status: "active",
    });
    setBusy(false);
    if (error) {
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
          {feedback && <p role={feedback.ok ? "status" : "alert"} className={feedback.ok ? "text-sm text-primary" : "text-sm text-destructive"}>{feedback.text}</p>}
          <button type="submit" disabled={busy} className="w-full rounded-full bg-primary px-6 py-3 text-base font-semibold text-primary-foreground disabled:opacity-60">
            {busy ? copy.loading : copy.create}
          </button>
        </form>
      )}
    </section>
  );
}
