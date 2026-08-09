import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { clientEnv } from "@/lib/env";

/**
 * Supabase server client (AGENTS.md §2). Use from Server Components,
 * Route Handlers, and Server Actions. Binds to the request's cookie store;
 * create it per request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(clientEnv.supabaseUrl, clientEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Called from a Server Component. Safe to ignore; the middleware
          // refreshes the session cookie on the next request.
        }
      },
    },
  });
}
