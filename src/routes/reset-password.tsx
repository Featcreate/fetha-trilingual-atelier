import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell, Field, SubmitButton } from "@/components/AuthShell";
import { authErrorMessage, useLang } from "@/lib/i18n";
import { passwordSchema } from "@/lib/account-rules";
import { clearPasswordRecovery, hasPasswordRecovery } from "@/lib/password-recovery";

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
  const [ready, setReady] = useState<"wait" | "confirm" | "ok" | "invalid">("wait");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    const currentUrl = new URL(window.location.href);
    const hashParams = new URLSearchParams(currentUrl.hash.replace(/^#/, ""));
    const providerError =
      currentUrl.searchParams.get("error_code") ??
      hashParams.get("error_code") ??
      currentUrl.searchParams.get("error");

    const clearAuthParams = () => {
      window.history.replaceState({}, document.title, window.location.pathname);
    };

    // The custom recovery email link lands here without consuming its OTP.
    // Only the user's explicit button click below calls verifyOtp.
    const tokenHash = currentUrl.searchParams.get("token_hash");
    if (tokenHash && currentUrl.searchParams.get("type") === "recovery") {
      setReady("confirm");
      return () => {
        active = false;
      };
    }

    // An expired/consumed OTP cannot establish a recovery session.
    if (providerError) {
      setReady("invalid");
      clearAuthParams();
      return () => {
        active = false;
      };
    }

    const recoveryMarker =
      currentUrl.searchParams.has("code") ||
      currentUrl.searchParams.get("type") === "recovery" ||
      hashParams.get("type") === "recovery";

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
        (recoveryMarker || hasPasswordRecovery())
      ) {
        setReady("ok");
        clearAuthParams();
      }
    });

    const timer = window.setTimeout(() => {
      if (active) setReady((current) => (current === "ok" ? "ok" : "invalid"));
    }, 12000);

    return () => {
      active = false;
      window.clearTimeout(timer);
      data.subscription.unsubscribe();
    };
  }, []);

  async function confirmRecovery() {
    const currentUrl = new URL(window.location.href);
    const tokenHash = currentUrl.searchParams.get("token_hash");
    if (!tokenHash || currentUrl.searchParams.get("type") !== "recovery") {
      setReady("invalid");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: "recovery",
      });
      if (verifyError) {
        setError(authErrorMessage(a, verifyError));
        setReady("invalid");
        return;
      }
      setReady("ok");
      window.history.replaceState({}, document.title, window.location.pathname);
    } catch {
      setError(a.errGeneric);
      setReady("invalid");
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const pw = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirm_password") ?? "");
    if (!passwordSchema.safeParse(pw).success) return setError(a.errPassword);
    if (pw !== confirmation) return setError(a.errPasswordMismatch);
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) return setError(authErrorMessage(a, error));
      clearPasswordRecovery();
      navigate({ to: "/account", replace: true });
    } catch {
      setError(a.errGeneric);
    } finally {
      setBusy(false);
    }
  }

  const confirmLabel =
    lang === "ar"
      ? "متابعة إعادة تعيين كلمة المرور"
      : lang === "fr"
        ? "Continuer la réinitialisation"
        : "Continue password reset";

  return (
    <AuthShell lang={lang} setLang={setLang} title={a.resetTitle}>
      {ready === "wait" && <p className="text-muted-foreground">{a.loading}</p>}
      {ready === "confirm" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {lang === "ar"
              ? "اضغط للمتابعة والتحقق من رابط الاستعادة."
              : lang === "fr"
                ? "Cliquez pour continuer et vérifier le lien de réinitialisation."
                : "Continue to verify your password reset link."}
          </p>
          <button
            type="button"
            onClick={() => void confirmRecovery()}
            disabled={busy}
            className="inline-flex w-full items-center justify-center rounded-lg bg-coral px-4 py-3 font-semibold text-white disabled:opacity-60"
          >
            {busy ? a.loading : confirmLabel}
          </button>
        </div>
      )}
      {ready === "invalid" && (
        <div className="space-y-3 text-sm">
          <p>{error || a.resetInvalid}</p>
          <Link
            to="/auth"
            search={{ mode: "forgot" }}
            className="font-semibold text-coral hover:underline"
          >
            {a.forgot}
          </Link>
        </div>
      )}
      {ready === "ok" && (
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field
            id="password"
            label={a.newPassword}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
            error={error}
          />
          <Field
            id="confirm_password"
            label={a.confirmPassword}
            type="password"
            dir="ltr"
            autoComplete="new-password"
            minLength={8}
            maxLength={72}
            required
          />
          <SubmitButton busy={busy} label={a.resetSave} busyLabel={a.loading} />
        </form>
      )}
    </AuthShell>
  );
}
