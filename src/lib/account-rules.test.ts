import { describe, expect, it } from "vitest";
import { passwordSchema, phoneSchema, profileSchema, safeRedirect } from "./account-rules";

describe("account rules", () => {
  it("accepts Tunisian phone formats", () => {
    expect(phoneSchema.safeParse("+216 22 123 456").success).toBe(true);
    expect(phoneSchema.safeParse("22123456").success).toBe(true);
  });
  it("rejects invalid phones", () => {
    expect(phoneSchema.safeParse("abc").success).toBe(false);
    expect(phoneSchema.safeParse("123").success).toBe(false);
  });
  it("requires a full name of at least 2 characters", () => {
    expect(profileSchema.safeParse({ full_name: " a ", phone: "22123456" }).success).toBe(false);
  });
  it("requires passwords of at least 8 characters", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
  });
  it("only redirects to same-origin paths", () => {
    expect(safeRedirect("//evil.com")).toBe("/account");
    expect(safeRedirect("https://evil.com")).toBe("/account");
    expect(safeRedirect("/account")).toBe("/account");
  });
});
