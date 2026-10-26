import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { useLang } from "@/lib/i18n";
import { fullNameSchema, phoneSchema } from "@/lib/account-rules";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Mon compte — Algorea Bazaar" },
      { name: "description", content: "Gérez vos informations de compte client Algorea Bazaar." },
      { property: "og:title", content: "Mon compte — Algorea Bazaar" },
      { property: "og:description", content: "Espace client Algorea Bazaar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AccountPage,
});

type Errs = Partial<Record<"email" | "password" | "full_name" | "phone", string>>;

function AccountPage() {
  const { lang, setLang, t } = useLang();
  const a = t.auth;
  const { user } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [errors, setErrors] = useState<Errs>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const profile = useQuery({
    queryKey: ["profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name, phone, created_at")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Phone/name given at sign-up live in account metadata until first saved to the profile.
  const meta = (user.user_metadata ?? {}) as { full_name?: string; phone?: string };
  const initialName = profile.data?.full_name || meta.full_name || "";
  const initialPhone = profile.data?.phone || meta.phone || "";

  useEffect(() => {
    const p = profile.data;
    if (!p) return;
    const patch: { full_name?: string; phone?: string } = {};
    if (!p.full_name && meta.full_name && fullNameSchema.safeParse(meta.full_name).success) patch.full_name = meta.full_name.trim();
    if (!p.phone && meta.phone && phoneSchema.safeParse(meta.phone).success) patch.phone = meta.phone.trim();
    if (Object.keys(patch).length) {
      supabase.from("profiles").update(patch).eq("id", user.id).then(({ error }) => {
        if (!error) queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.data]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const full_name = String(f.get("full_name") ?? "").trim();
    const phone = String(f.get("phone") ?? "").trim();
    const errs: Errs = {};
    if (!fullNameSchema.safeParse(full_name).success) errs.full_name = a.errName;
    if (!phoneSchema.safeParse(phone).success) errs.phone = a.errPhone;
    setErrors(errs);
    setMessage(null);
    if (Object.keys(errs).length) return;
    setBusy(true);
    const { error } = await supabase.from("profiles").update({ full_name, phone }).eq("id", user.id);
    setBusy(false);
    if (error) return setMessage({ ok: false, text: a.errGeneric });
    await queryClient.invalidateQueries({ queryKey: ["profile", user.id] });
    setMessage({ ok: true, text: a.saved });
  }

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const locale = lang === "ar" ? "ar-TN" : lang === "en" ? "en-GB" : "fr-FR";
  const since = profile.data?.created_at ?? user.created_at;

  return (
    <AuthShell lang={lang} setLang={setLang} title={a.account} wide>
      <dl className="grid gap-3 rounded-xl bg-secondary p-4 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{a.email}</dt>
          <dd className="font-medium" dir="ltr">{user.email}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{a.memberSince}</dt>
          <dd className="font-medium">{new Date(since).toLocaleDateString(locale)}</dd>
        </div>
      </dl>

      <h2 className="mt-8 text-lg font-bold">{a.profileTitle}</h2>
      {profile.isPending ? (
        <p className="mt-4 text-muted-foreground">{a.loading}</p>
      ) : profile.isError ? (
        <p role="alert" className="mt-4 text-sm text-destructive">{a.errGeneric}</p>
      ) : (
        <form key={`${initialName}|${initialPhone}`} onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
          <Field id="full_name" label={a.fullName} autoComplete="name" maxLength={120} defaultValue={initialName} error={errors.full_name} />
          <Field id="phone" label={a.phone} type="tel" dir="ltr" autoComplete="tel" maxLength={20} defaultValue={initialPhone} error={errors.phone} />
          {message && (
            <p role={message.ok ? "status" : "alert"} className={`rounded-lg p-3 text-sm ${message.ok ? "bg-secondary" : "bg-destructive/10 text-destructive"}`}>
              {message.text}
            </p>
          )}
          <SubmitButton busy={busy} label={a.save} busyLabel={a.loading} />
        </form>
      )}

      <button
        type="button"
        onClick={signOut}
        className="mt-6 w-full rounded-full border border-border px-6 py-3 font-semibold hover:bg-secondary"
      >
        {a.signOut}
      </button>
    </AuthShell>
  );
}
