import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { adminCheckIpayConnection } from "@/lib/admin-security.functions";

export const Route = createFileRoute("/_authenticated/admin-ipay-check")({
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) {
      throw redirect({ to: "/auth", search: { redirect: location.href } });
    }
    if (data.user.email?.toLowerCase() !== "fathiaivy@gmail.com") {
      throw redirect({ to: "/account" });
    }
  },
  component: AdminIpayCheckPage,
});

function AdminIpayCheckPage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof adminCheckIpayConnection>> | null
  >(null);

  async function runCheck() {
    setBusy(true);
    setResult(null);
    try {
      setResult(await adminCheckIpayConnection());
    } catch {
      setResult({
        ok: false,
        authenticated: false,
        error: "provider_request_failed",
      } as Awaited<ReturnType<typeof adminCheckIpayConnection>>);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-10" dir="rtl">
      <a href="/admin" className="text-sm font-semibold text-coral hover:underline">
        العودة إلى لوحة الإدارة
      </a>
      <h1 className="text-2xl font-bold">فحص اتصال iPay</h1>
      <p className="text-sm leading-7 text-muted-foreground">
        فحص قراءة فقط باستخدام X-Org-Id وJWT عبر نقطة صحة تكامل iPay. لا ينشئ معاملة ولا يغيّر
        إعدادات الدفع. لن تظهر هنا أي مفاتيح أو رموز سرية.
      </p>
      <button
        type="button"
        onClick={() => void runCheck()}
        disabled={busy}
        className="rounded-full bg-accent px-5 py-3 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? "جارٍ فحص الاتصال…" : "ابدأ فحص الاتصال"}
      </button>
      {result && (
        <section className="space-y-3 rounded-xl border border-border p-4" aria-live="polite">
          {result.ok && result.authenticated ? (
            <>
              <p className="font-semibold text-green-700">نجحت المصادقة مع iPay</p>
              <p className="text-sm">
                حالة webhooks العامة: {result.overallHealthy ? "سليمة" : "تحتاج إلى مراجعة"}
              </p>
              {result.products.map((product, index) => (
                <div
                  key={product.productCode ?? index}
                  className="rounded-lg bg-secondary p-3 text-sm"
                >
                  <p className="font-semibold">{product.productName ?? product.productCode ?? "منتج iPay"}</p>
                  <p>Webhook النجاح: {product.successWebhookConfigured ? "مُعدّ" : "غير مُعدّ"}</p>
                  <p>Webhook الفشل: {product.failureWebhookConfigured ? "مُعدّ" : "غير مُعدّ"}</p>
                </div>
              ))}
            </>
          ) : result.error === "missing_server_configuration" ? (
            <>
              <p className="font-semibold text-destructive">إعدادات الخادم ناقصة</p>
              <p className="text-sm">المتغيرات غير الموجودة: {result.missing.join("، ")}</p>
            </>
          ) : result.error === "forbidden" ? (
            <p className="font-semibold text-destructive">غير مصرح لك بإجراء هذا الفحص.</p>
          ) : (
            <p className="font-semibold text-destructive">
              لم تنجح المصادقة أو لم يستجب iPay للطلب. لم يتم إنشاء أي معاملة.
            </p>
          )}
        </section>
      )}
    </main>
  );
}
