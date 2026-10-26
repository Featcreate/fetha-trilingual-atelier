import { z } from "zod";

/** Customer profile rules shared by sign-up and account editing. */
export const fullNameSchema = z.string().trim().min(2).max(120);
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s-]{6,18}[0-9]$/);
export const emailSchema = z.string().trim().email().max(255);
export const passwordSchema = z.string().min(8).max(72);

export const profileSchema = z.object({ full_name: fullNameSchema, phone: phoneSchema });

/** Safe in-app redirect target: only same-origin paths. */
export function safeRedirect(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}
