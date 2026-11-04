import { supabase } from "@/integrations/supabase/client";

const RECOVERY_KEY = "algorea-bazaar:password-recovery";
let recoveryDetected = false;

// Register before React mounts so Supabase cannot emit PASSWORD_RECOVERY
// before the reset page has a chance to subscribe.
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((event) => {
    if (event !== "PASSWORD_RECOVERY") return;
    recoveryDetected = true;
    try {
      window.sessionStorage.setItem(RECOVERY_KEY, "1");
    } catch {
      // The in-memory flag still covers this page if storage is unavailable.
    }
  });
}

export function hasPasswordRecovery(): boolean {
  if (recoveryDetected) return true;
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(RECOVERY_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordRecovery(): void {
  recoveryDetected = false;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(RECOVERY_KEY);
  } catch {
    // No action needed; the in-memory flag is already cleared.
  }
}
