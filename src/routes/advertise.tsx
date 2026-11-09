import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useSession } from "@/hooks/use-session";
import { useLang } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import {
  createPaidAdvertisingRequest,
  getMyPaidAdvertisingRequests,
  getPaidAdvertisingPackages,
} from "@/lib/advertising.functions";
import { formatTND } from "@/lib/money";

export const Route = createFileRoute("/advertise")({
  head: () => ({
    meta: [
      { title: "Publicité — Algorea Bazaar" },
      { name: "description", content: "Proposez une publicité payante sur Algorea Bazaar." },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdvertisePage,
});

function AdvertisePage() {
  const { lang } = useLang();
  const { session, ready } = useSession();
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [destinationUrl, setDestinationUrl] = useState("");
  const [durationDays, setDurationDays] = useState<7 | 14 | 30>(7);
  const [creative, setCreative] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const ar = lang === "ar";
  const en = lang === "en";
  const copy = {
    title: ar ? "الإعلان على Algorea Bazaar" : en ? "Advertise on Algorea Bazaar" : "Publicité sur Algorea Bazaar",
    intro: ar ? "قدّم طلب إعلان لعرض منتجك أو خدمتك الرقمية. تتم مراجعة المحتوى قبل النشر." : en ? "Submit an advertisement for your digital product or service. Every creative is reviewed before publication." : "Proposez une publicité pour votre produit ou service numérique. Chaque contenu est vérifié avant sa publication.",
    headline: ar ? "عنوان الإعلان" : en ? "Advertisement title" : "Titre de l’annonce",
    description: ar ? "وصف الإعلان" : en ? "Advertisement description" : "Description de l’annonce",
    url: ar ? "رابط الوجهة (HTTPS)" : en ? "Destination URL (HTTPS)" : "Lien de destination (HTTPS)",
    image: ar ? "صورة الإعلان (JPG, PNG, WebP أو AVIF — 10 ميغابايت كحد أقصى)" : en ? "Creative image (JPG, PNG, WebP or AVIF — max 10 MB)" : "Image publicitaire (JPG, PNG, WebP ou AVIF — 10 Mo maximum)",
    duration: ar ? "مدة العرض" : en ? "Duration" : "Durée",
    submit: ar ? "إرسال طلب الإعلان" : en ? "Submit advertising request" : "Envoyer la demande",
    signin: ar ? "سجّل الدخول لتقديم طلب إعلان." : en ? "Sign in to submit an advertisement." : "Connectez-vous pour proposer une publicité.",
    paymentPending: ar ? "سيُتاح الدفع عبر iPay بعد ربط حساب المنصة والتحقق من مسار المعاملة. لن يظهر الإعلان قبل تأكيد الدفع وموافقة الإدارة." : en ? "iPay checkout will be enabled after the platform account is connected and transaction verification is validated. Ads remain hidden until payment is confirmed and approved by an administrator." : "Le paiement iPay sera disponible après la connexion du compte de la plateforme et la validation du contrôle des transactions. La publicité restera masquée jusqu’à la confirmation du paiement et l’approbation administrative.",
    myRequests: ar ? "طلباتي الإعلانية" : en ? "My advertising requests" : "Mes demandes publicitaires",
    noRequests: ar ? "لا توجد طلبات إعلانية بعد." : en ? "No advertising requests yet." : "Aucune demande publicitaire pour le moment.",
    sent: ar ? "تم تسجيل الطلب. الدفع عبر iPay غير مفعّل حالياً." : en ? "Your request was saved. iPay checkout is not enabled yet." : "Votre demande est enregistrée. Le paiement iPay n’est pas encore activé.",
    fail: ar ? "تعذر إرسال الطلب. تحقّق من البيانات وحاول مجدداً." : en ? "Could not submit the request. Check the details and try again." : "Impossible d’envoyer la demande. Vérifiez les informations et réessayez.",
    loading: ar ? "جارٍ التحميل…" : en ? "Loading…" : "Chargement…",
    status: ar ? "الحالة" : en ? "Status" : "Statut",
    pending: ar ? "بانتظار الدفع" : en ? "Awaiting payment" : "En attente de paiement",
    durationDays: ar ? "أيام" : en ? "days" : "jours",
    required: ar ? "هذا الحقل مطلوب." : en ? "This field is required." : "Ce champ est obligatoire.",
  };
  const packageQuery = useQuery({
    queryKey: ["paid-advertising-packages"],
    queryFn: () => getPaidAdvertisingPackages(),
  });
  const history = useQuery({
    queryKey: ["my-paid-advertising-requests"],
    enabled: !!session?.user.id,
    queryFn: () => getMyPaidAdvertisingRequests(),
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session?.user.id || !creative) {
      setNotice({ ok: false, text: copy.required });
      return;
    }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/avif"];
    if (!allowed.includes(creative.type) || creative.size < 1 || creative.size > 10 * 1024 * 1024) {
      setNotice({ ok: false, text: copy.image });
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(destinationUrl);
    } catch {
      setNotice({ ok: false, text: copy.required });
      return;
    }
    if (parsed.protocol !== "https:") {
      setNotice({ ok: false, text: copy.required });
      return;
    }

    setBusy(true);
    setNotice(null);
    const extension = creative.type === "image/jpeg" ? "jpg" : creative.type.split("/")[1];
    const imagePath = `${session.user.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("advertising-assets").upload(imagePath, creative, {
      contentType: creative.type,
      upsert: false,
    });
    if (uploadError) {
      setBusy(false);
      setNotice({ ok: false, text: copy.fail });
      return;
    }
    const result = await createPaidAdvertisingRequest({
      data: { title, description, destinationUrl: parsed.toString(), imagePath, durationDays },
    });
    setBusy(false);
    if (!result.ok) {
      await supabase.storage.from("advertising-assets").remove([imagePath]);
      setNotice({ ok: false, text: copy.fail });
      return;
    }
    setTitle("");
    setDescription("");
    setDestinationUrl("");
    setCreative(null);
    setDurationDays(7);
    setNotice({ ok: true, text: copy.sent });
    await qc.invalidateQueries({ queryKey: ["my-paid-advertising-requests"] });
  }

  const locale = ar ? "ar-TN" : en ? "en-GB" : "fr-FR";
  const statusLabel = (value: unknown) => String(value ?? "");
  return (
    <main dir={ar ? "rtl" : "ltr"} className="min-h-screen bg-cream-light px-4 py-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="text-sm font-semibold text-coral hover:underline">Algorea Bazaar</Link>
        <section className="mt-5 rounded-2xl border border-border bg-card p-5 shadow-sm md:p-8">
          <h1 className="text-2xl font-extrabold text-petrol">{copy.title}</h1>
          <p className="mt-3 leading-7 text-muted-foreground">{copy.intro}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {(packageQuery.data?.ok ? packageQuery.data.packages : []).map((item) => (
              <button key={item.duration_days} type="button" onClick={() => setDurationDays(item.duration_days as 7 | 14 | 30)}
                className={`rounded-xl border p-4 text-start transition ${durationDays === item.duration_days ? "border-coral bg-coral/5 ring-1 ring-coral" : "border-border"}`}>
                <span className="block text-sm text-muted-foreground">{item.duration_days} {copy.durationDays}</span>
                <span className="mt-1 block text-xl font-extrabold text-petrol">{formatTND(item.price_millimes)}</span>
              </button>
            ))}
          </div>
          {notice && <p role={notice.ok ? "status" : "alert"} className={`mt-4 rounded-lg p-3 text-sm ${notice.ok ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}>{notice.text}</p>}
          {!ready ? <p className="mt-5">{copy.loading}</p> : !session ? (
            <p className="mt-5 rounded-lg bg-secondary p-4 text-sm">{copy.signin} <Link to="/auth" className="font-semibold text-coral underline">{ar ? "تسجيل الدخول" : en ? "Sign in" : "Connexion"}</Link></p>
          ) : (
            <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
              <label className="block text-sm font-semibold">{copy.headline}
                <input required minLength={3} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3" />
              </label>
              <label className="block text-sm font-semibold">{copy.description}
                <textarea required minLength={10} maxLength={1000} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2" />
              </label>
              <label className="block text-sm font-semibold">{copy.url}
                <input required type="url" value={destinationUrl} onChange={(e) => setDestinationUrl(e.target.value)} placeholder="https://" className="mt-1 h-11 w-full rounded-lg border border-input bg-background px-3" />
              </label>
              <label className="block text-sm font-semibold">{copy.image}
                <input required type="file" accept="image/jpeg,image/png,image/webp,image/avif" onChange={(e) => setCreative(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-sm" />
              </label>
              <p className="rounded-lg bg-secondary p-3 text-sm leading-6 text-muted-foreground">{copy.paymentPending}</p>
              <button type="submit" disabled={busy || !packageQuery.data?.ok || !packageQuery.data.packages.some((item) => item.duration_days === durationDays)} className="w-full rounded-full bg-accent px-5 py-3 font-bold text-accent-foreground disabled:opacity-50">
                {busy ? copy.loading : copy.submit}
              </button>
            </form>
          )}
        </section>
        {session && (
          <section className="mt-8 rounded-2xl border border-border bg-card p-5 md:p-8">
            <h2 className="text-lg font-bold text-petrol">{copy.myRequests}</h2>
            {history.isPending ? <p className="mt-4 text-sm">{copy.loading}</p> : history.isError || !history.data?.ok ? (
              <p className="mt-4 text-sm text-destructive">{copy.fail}</p>
            ) : !history.data.requests.length ? <p className="mt-4 text-sm text-muted-foreground">{copy.noRequests}</p> : (
              <div className="mt-4 space-y-3">
                {history.data.requests.map((request) => (
                  <article key={String(request.id)} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border p-4">
                    <div><p className="font-semibold">{String(request.title)}</p><p className="text-xs text-muted-foreground">{String(request.duration_days)} {copy.durationDays} · {formatTND(Number(request.price_millimes))} · {new Date(String(request.created_at)).toLocaleDateString(locale)}</p></div>
                    <span className="rounded-full bg-secondary px-3 py-1 text-xs">{statusLabel(request.status) === "awaiting_payment" ? copy.pending : statusLabel(request.status)}</span>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
