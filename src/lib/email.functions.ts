import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const schema = z.object({
  action: z.enum(["preview", "send"]),
  audience: z.enum(["all", "sellers"]),
  subject: z.string().trim().min(3).max(180),
  body: z.string().trim().min(5).max(10000),
});

export const adminSendAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => schema.parse(input))
  .handler(async ({ data, context }) => {
    const email = typeof context.claims.email === "string" ? context.claims.email.toLowerCase() : "";
    if (email !== "fathiaivy@gmail.com") return { ok: false as const, error: "forbidden" };

    const { getAnnouncementRecipientCount, sendAnnouncement } = await import("@/lib/email.server");
    if (data.action === "preview") {
      try {
        const count = await getAnnouncementRecipientCount(data.audience);
        return { ok: true as const, count };
      } catch {
        return { ok: false as const, error: "recipient_lookup_failed" };
      }
    }

    try {
      await sendAnnouncement({
        audience: data.audience,
        subject: data.subject,
        body: data.body,
      });
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : "email_send_failed";
      return {
        ok: false as const,
        error: message === "gmail_not_configured" ? "gmail_not_configured" :
          message === "no_recipients" ? "no_recipients" : "email_send_failed",
      };
    }
  });
