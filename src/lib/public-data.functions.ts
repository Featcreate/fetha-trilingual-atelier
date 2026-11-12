import { createServerFn } from "@tanstack/react-start";

export const getTopRatedStores = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_top_rated_stores");
  if (error) throw new Error("Unable to load top-rated stores");
  return data ?? [];
});
