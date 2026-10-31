import { Link } from "@tanstack/react-router";
import type { InputHTMLAttributes, ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { LANGS, dict, type Lang } from "@/lib/i18n";

export function LangSwitcher({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <div
      className="flex shrink-0 rounded-full border border-border bg-card p-1"
      role="group"
      aria-label="Language"
    >
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          aria-pressed={lang === l}
          lang={l}
          title={dict[l].langName}
          className={`rounded-full px-3 py-1 text-xs font-bold uppercase transition-colors ${
            lang === l ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-secondary"
          }`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

/** Minimal branded frame for sign-in and account pages. */
export function AuthShell({
  lang,
  setLang,
  title,
  children,
  wide = false,
}: {
  lang: Lang;
  setLang: (l: Lang) => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-cream-light">
      <header className="border-b border-border bg-background/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 md:h-20">
          <Link to="/" className="flex h-12 w-28 shrink-0 md:h-14 md:w-36">
            <BrandLogo className="h-full w-full" />
          </Link>
          <LangSwitcher lang={lang} setLang={setLang} />
        </div>
      </header>
      <main className="px-4 py-10 md:py-16">
        <div
          className={`mx-auto ${wide ? "max-w-2xl" : "max-w-md"} rounded-2xl border border-border bg-card p-6 shadow-soft md:p-8`}
        >
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-6 text-center text-sm">
          <Link to="/" className="text-muted-foreground hover:text-coral">
            {dict[lang].auth.back}
          </Link>
        </p>
      </main>
    </div>
  );
}

export function Field({
  id,
  label,
  error,
  ...props
}: {
  id: string;
  label: string;
  error?: string | undefined;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={id}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-err` : undefined}
        className="w-full rounded-lg border border-input bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-ring"
        {...props}
      />
      {error && (
        <p id={`${id}-err`} className="mt-1 text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({
  busy,
  label,
  busyLabel,
}: {
  busy: boolean;
  label: string;
  busyLabel: string;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="w-full rounded-full bg-accent px-6 py-3 font-semibold text-accent-foreground shadow-soft transition-opacity disabled:opacity-60"
    >
      {busy ? busyLabel : label}
    </button>
  );
}
