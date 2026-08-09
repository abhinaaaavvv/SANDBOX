import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/**
 * Supabase browser client (AGENTS.md §2). Use from client components and
 * hooks only. The generated Database type can be plugged in as a generic
 * once `supabase gen types` is available.
 */
export function createClient() {
  return createBrowserClient(clientEnv.supabaseUrl, clientEnv.supabasePublishableKey);
}
