import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useLang } from "@/lib/i18n";

function AuthenticatedRoutePending() {
  const { lang } = useLang();
  const message =
    lang === "ar"
      ? "جارٍ التحقق من جلسة الدخول..."
      : lang === "en"
        ? "Checking your sign-in..."
        : "Vérification de votre session...";

  return (
    <div className="flex min-h-[40vh] items-center justify-center px-4">
      <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
        {message}
      </p>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  pendingComponent: AuthenticatedRoutePending,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    return { user: data.user };
  },
  component: () => <Outlet />,
});
