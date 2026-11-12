import type { Json } from "@/integrations/supabase/types";

type ActorRpcResult = {
  data: Json;
  error: { message: string; code?: string } | null;
};

type ActorRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<ActorRpcResult>;
};

/**
 * Call an identity-bound database function from a verified server handler.
 * actorId must come from requireSupabaseAuth context, never from client input.
 */
export async function callActorScopedRpc(
  actorId: string,
  functionName: string,
  args: Record<string, unknown>,
): Promise<ActorRpcResult> {
  if (!actorId) {
    return { data: null, error: { message: "not_authenticated" } };
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const client = supabaseAdmin as unknown as ActorRpcClient;
  return client.rpc(functionName, { _actor_id: actorId, ...args });
}
