import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";

let client: ReturnType<typeof createSupabaseClient> | null = null;

/**
 * Supabase service-role client (server-only). Never import from client code —
 * `getServerEnv()` throws if evaluated in a browser bundle.
 * Used for: storage signed URLs, admin bootstrap, seeding, and any operation
 * that must bypass RLS by design (never to serve participant data directly).
 */
export function createAdminClient() {
  if (!client) {
    const env = getServerEnv();
    client = createSupabaseClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }
  return client;
}
