import { z } from "zod";

/**
 * Environment validation (AGENTS.md §2, architecture review Part L).
 *
 * - `clientEnv` is parsed at module load so a missing/misconfigured public
 *   variable fails fast everywhere it is used (browser, middleware, server).
 * - `getServerEnv()` is lazy + memoized so the server-only service-role key is
 *   never read in client bundles. Calling it from client code throws a clear
 *   error at runtime instead of silently shipping an undefined secret.
 */

const publicEnvSchema = z.object({
  supabaseUrl: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_URL is required (see .env.example)" })
    .url(),
  supabasePublishableKey: z
    .string({ error: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is required (see .env.example)" })
    .min(1),
});

const fullEnvSchema = publicEnvSchema.extend({
  supabaseServiceRoleKey: z
    .string({ error: "SUPABASE_SERVICE_ROLE_KEY is required on the server (see .env.example)" })
    .min(1),
});

export const clientEnv = publicEnvSchema.parse({
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
});

let serverEnvCache: z.infer<typeof fullEnvSchema> | null = null;

export function getServerEnv(): z.infer<typeof fullEnvSchema> {
  if (serverEnvCache) return serverEnvCache;
  serverEnvCache = fullEnvSchema.parse({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return serverEnvCache;
}
