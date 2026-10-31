import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { authErrorMessage, useLang } from "@/lib/i18n";
import { emailSchema, fullNameSchema, passwordSchema, phoneSchema, safeRedirect } from "@/lib/account-rules";

type Mode = "signin" | "signup" | "forgot";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ mode: z.enum(["signin", "signup", "forgot"]).optional(), redirect: z.string().optional() }).parse({
      mode: s["mode"],
      redirect: typeof s["redirect"] === "string" ? s["redirect"] : undefined,
    }),
  head: () => ({
    meta: [
      { title: "Connexion — Algorea Bazaar" },
      { name: "description", content: "Connectez-vous ou créez votre compte client Algorea Bazaar." },
      { property: "og:title", content: "Connexion — Algorea Bazaar" },
      { property: "og:description", content: "Espace client Algorea Bazaar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

type Errs = Partial<Record<"email" | "password" | "full_name" | "phone", string>>;

function AuthPage() {
  const { lang, setLang, t } = useLang();
  const a = t.auth;
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode: Mode = search.mode ?? "signin";
  const target = safeRedirect(search.redirect);

  const [errors, setErrors] = useState<Errs>({});
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendEmail, setResendEmail] = useState("");
  const [showResend, setShowResend] = useState(false);

  useEffect(() => {
    setErrors({});
    setFormError("");
    setNotice("");
    setShowResend(false);
    setResendEmail("");
  }, [mode]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: target, replace: true });
    });
  }, [navigate, target]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = (k: string) => String(f.get(k) ?? "");
    const errs: Errs = {};
    if (!emailSchema.safeParse(v("email")).success) errs.email = a.errEmail;
    if (mode !== "forgot" && !passwordSchema.safeParse(v("password")).success) errs.password = a.errPassword;
    if (mode === "signup") {
      if (!fullNameSchema.safeParse(v("full_name")).success) errs.full_name = a.errName;
      if (!phoneSchema.safeParse(v("phone")).success) errs.phone = a.errPhone;
    }
    setErrors(errs);
    setFormError("");
    setNotice("");
    if (Object.keys(errs).length) return;

    setBusy(true);
    const email = v("email").trim();
    setResendEmail(email);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: v("password") });
        if (error) {
          const detail = `${error.code ?? ""} ${error.message}`.toLowerCase();
          if (detail.includes("not_confirmed") || detail.includes("not confirmed")) setShowResend(true);
          return setFormError(authErrorMessage(a, error));
        }
        navigate({ to: target, replace: true });
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: v("password"),
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: v("full_name").trim(), phone: v("phone").trim() },
          },
        });
        if (error) return setFormError(authErrorMessage(a, error));
        if (data.session) navigate({ to: "/account", replace: true });
        else setNotice(a.checkEmail);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error && error.status === 429) return setFormError(a.errRate);
        setNotice(a.resetSent);
      }
    } catch {
      setFormError(a.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  async function resendConfirmation() {
    if (!emailSchema.safeParse(resendEmail).success) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: resendEmail });
      if (error) setFormError(authErrorMessage(a, error));
      else setNotice(a.confirmationResent);
    } catch {
      setFormError(a.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "signup" ? a.signUpTitle : mode === "forgot" ? a.forgotTitle : a.signInTitle;
  const submit = mode === "signup" ? a.signUp : mode === "forgot" ? a.sendReset : a.signIn;

  return (
    <AuthShell lang={lang} setLang={setLang} title={title}>
      <form key={mode} onSubmit={onSubmit} noValidate className="space-y-4">
        {mode === "signup" && (
          <>
            <Field id="full_name" label={a.fullName} autoComplete="name" maxLength={120} error={errors.full_name} />
            <Field id="phone" label={a.phone} type="tel" dir="ltr" autoComplete="tel" maxLength={20} error={errors.phone} />
          </>
        )}
        <Field id="email" label={a.email} type="email" dir="ltr" autoComplete="email" maxLength={255} error={errors.email} />
        {mode !== "forgot" && (
          <Field
            id="password"
            label={a.password}
            type="password"
            dir="ltr"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            maxLength={72}
            error={errors.password}
          />
        )}
        {formError && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{formError}</p>}
        {notice && <p role="status" className="rounded-lg bg-secondary p-3 text-sm">{notice}</p>}
        {showResend && mode === "signin" && (
          <button type="button" disabled={busy} onClick={resendConfirmation}
            className="w-full rounded-full border border-border px-5 py-3 text-sm font-semibold hover:bg-secondary disabled:opacity-60">
            {busy ? a.loading : a.resendConfirmation}
          </button>
        )}
        <SubmitButton busy={busy} label={submit} busyLabel={a.loading} />
      </form>

      <div className="mt-6 space-y-2 text-center text-sm">
        {mode === "signin" && (
          <>
            <p><Link to="/auth" search={{ mode: "forgot" }} className="text-coral hover:underline">{a.forgot}</Link></p>
            <p>{a.noAccount} <Link to="/auth" search={{ mode: "signup", redirect: search.redirect }} className="font-semibold text-coral hover:underline">{a.signUp}</Link></p>
          </>
        )}
        {mode !== "signin" && (
          <p>{a.haveAccount} <Link to="/auth" search={{ mode: "signin", redirect: search.redirect }} className="font-semibold text-coral hover:underline">{a.signIn}</Link></p>
        )}
      </div>
    </AuthShell>
  );
}
