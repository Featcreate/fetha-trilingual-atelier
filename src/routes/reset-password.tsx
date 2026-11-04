import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { authErrorMessage, useLang } from "@/lib/i18n";
import { passwordSchema } from "@/lib/account-rules";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Nouveau mot de passe — Algorea Bazaar" },
      {
        name: "description",
        content: "Choisissez un nouveau mot de passe pour votre compte Algorea Bazaar.",
      },
      { property: "og:title", content: "Nouveau mot de passe — Algorea Bazaar" },
      { property: "og:description", content: "Réinitialisation du mot de passe Algorea Bazaar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { lang, setLang, t } = useLang();
  const a = t.auth;
  const navigate = useNavigate();
  const [ready, setReady] = useState<"wait" | "ok" | "invalid">("wait");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    // Supabase may finish processing the recovery URL before this route mounts.
    // In that case, recover the PASSWORD_RECOVERY state from the validated session
    // plus the one-time recovery marker still present in the URL.
    const recoveryMarker =
      currentUrl.searchParams.has("code") ||
      currentUrl.searchParams.get("type") === "recovery" ||
      hashParams.get("type") === "recovery";

    const clearAuthParams = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && active) {
        setReady("ok");
        clearAuthParams();
      }
    });

    void supabase.auth.getSession().then(({ data: sessionData, error: sessionError }) => {
      if (
        active &&
        !sessionError &&
        sessionData.session &&
        recoveryMarker
      ) {
        setReady("ok");
        clearAuthParams();
      }
    });

    const timer = setTimeout(() => {
      if (active) setReady((current) => (current === "ok" ? "ok" : "invalid"));
    }, 8000);

    return () => {
      active = false;
      clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const pw = String(new FormData(e.currentTarget).get("password") ?? "");
    if (!passwordSchema.safeParse(pw).success) return setError(a.errPassword);
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) return setError(authErrorMessage(a, error));
      navigate({ to: "/account", replace: true });
    } catch {
      setError(a.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell lang={lang} setLang={setLang} title={a.resetTitle}>
      {ready === "wait" && <p className="text-muted-foreground">{a.loading}</p>}
      {ready === "invalid" && (
        <p className="text-sm">
          {a.resetInvalid}{" "}
          <Link
            to="/auth"
            search={{ mode: "forgot" }}
            className="font-semibold text-coral hover:underline"
          >
            {a.forgot}
          </Link>
        </p>
      )}
      {ready === "ok" && (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field
            id="password"
            label={a.newPassword}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            maxLength={72}
            error={error}
          />
          <SubmitButton busy={busy} label={a.resetSave} busyLabel={a.loading} />
        </form>
      )}
    </AuthShell>
  );
}
