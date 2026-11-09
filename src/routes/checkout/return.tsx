import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { checkOrderPayment } from "@/lib/shop.functions";
import { useSession } from "@/hooks/use-session";
import { useLang } from "@/lib/i18n";

export const Route = createFileRoute("/checkout/return")({
  validateSearch: (search: Record<string, unknown>) => ({
    order: typeof search.order === "string" ? search.order : "",
  }),
  head: () => ({
    meta: [
      { title: "Confirmation du paiement — Algorea Bazaar" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CheckoutReturnPage,
});

function CheckoutReturnPage() {
  const { lang, setLang, t } = useLang();
  const { session, ready } = useSession();
  const { order } = Route.useSearch();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const payment = useQuery({
    queryKey: ["checkout-return-payment", order],
    queryFn: () => checkOrderPayment({ data: { orderId: order } }),
    enabled: ready && !!session && !!order,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (payment.data?.status === "paid") {
      navigate({ to: "/orders", replace: true });
    }
  }, [navigate, payment.data?.status]);

  const copy = {
    fr: {
      title: "Vérification du paiement",
      checking: "Nous vérifions votre paiement auprès du prestataire.",
      pending: "Le paiement n’est pas encore confirmé. Vous pouvez relancer la vérification dans quelques instants.",
      failed: "Le paiement n’a pas été confirmé. Aucun téléchargement n’a été débloqué.",
      error: "La vérification n’a pas abouti. Réessayez dans un instant.",
      retry: "Vérifier à nouveau",
      orders: "Voir mes achats",
      login: "Connectez-vous pour consulter votre achat.",
      missing: "Référence de commande manquante.",
      confirmed: "Paiement confirmé. Ouverture de vos achats…",
    },
    ar: {
      title: "التحقق من الدفع",
      checking: "نتحقق من عملية الدفع لدى مزود الخدمة.",
      pending: "لم يتم تأكيد الدفع بعد. يمكنك إعادة التحقق بعد لحظات.",
      failed: "لم يتم تأكيد الدفع، ولم يتم فتح إمكانية التنزيل.",
      error: "تعذر إتمام التحقق. حاول مجدداً بعد قليل.",
      retry: "إعادة التحقق",
      orders: "عرض مشترياتي",
      login: "سجّل الدخول للاطلاع على مشترياتك.",
      missing: "مرجع الطلب غير موجود.",
      confirmed: "تم تأكيد الدفع. جارٍ فتح مشترياتك…",
    },
    en: {
      title: "Payment verification",
      checking: "We are checking your payment with the provider.",
      pending: "Payment has not been confirmed yet. You can check again in a moment.",
      failed: "Payment was not confirmed. No download access has been granted.",
      error: "Verification could not be completed. Please try again shortly.",
      retry: "Check again",
      orders: "View my purchases",
      login: "Sign in to view your purchase.",
      missing: "The order reference is missing.",
      confirmed: "Payment confirmed. Opening your purchases…",
    },
  }[lang];

  const direction = lang === "ar" ? "rtl" : "ltr";
  const loginTarget = `/checkout/return?order=${encodeURIComponent(order)}`;

  return (
    <main dir={direction} className="mx-auto flex min-h-[70vh] max-w-2xl items-center px-4 py-12 text-start">
      <section className="w-full rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-petrol">{copy.title}</h1>
          <div className="flex gap-1 text-xs">
            {(["fr", "ar", "en"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setLang(value)}
                aria-pressed={lang === value}
                className={`rounded-full px-2 py-1 font-semibold ${lang === value ? "bg-primary text-primary-foreground" : "bg-secondary"}`}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {!order ? (
          <p role="alert" className="text-sm text-muted-foreground">{copy.missing}</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">{copy.checking}</p>
        ) : !session ? (
          <p className="text-sm text-muted-foreground">{copy.login}</p>
        ) : payment.isPending ? (
          <p className="text-sm text-muted-foreground">{copy.checking}</p>
        ) : payment.data?.status === "paid" ? (
          <p className="text-sm text-muted-foreground">{copy.confirmed}</p>
        ) : payment.data?.status === "failed" || payment.data?.status === "cancelled" ? (
          <p role="alert" className="text-sm text-muted-foreground">{copy.failed}</p>
        ) : payment.isError ? (
          <p role="alert" className="text-sm text-muted-foreground">{copy.error}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{copy.pending}</p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          {session && order && (
            <button
              type="button"
              disabled={checking || payment.isFetching}
              onClick={async () => {
                setChecking(true);
                await payment.refetch();
                setChecking(false);
              }}
              className="rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-50"
            >
              {checking || payment.isFetching ? copy.checking : copy.retry}
            </button>
          )}
          <Link
            to={session ? "/orders" : "/auth"}
            search={session ? undefined : { redirect: loginTarget }}
            className="rounded-full border border-border px-5 py-2.5 text-sm font-semibold hover:bg-secondary"
          >
            {session ? copy.orders : copy.login}
          </Link>
        </div>
      </section>
    </main>
  );
}
