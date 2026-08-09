import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { clientEnv } from "@/lib/env";
import { DEMO_SESSION_COOKIE } from "@/lib/demo-session";

/**
 * Session refresh + route gate executed by `src/proxy.ts` on the Edge
 * runtime. The browser never bundles this module.
 *
 * Enforces (server-side UX gate — the source of truth remains RLS + RPCs):
 *  - unauthenticated users are sent to the matching login page
 *  - authenticated users are sent off login pages to their console
 *  - /admin/* requires the admin role
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const demoCookie = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  const demoRole = demoCookie === "admin" || demoCookie === "participant" ? demoCookie : null;

  const supabase = createServerClient(
    clientEnv.supabaseUrl,
    clientEnv.supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // IMPORTANT: do not run any code between createServerClient and
  // supabase.auth.getUser() — the refresh flow is driven here.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminArea = pathname.startsWith("/admin");
  const isAdminLogin = pathname === "/admin/login";
  const isParticipantArea = pathname.startsWith("/participant");
  const isParticipantLogin = pathname === "/participant/login";

  if (!user && demoRole) {
    if (demoRole === "admin") {
      if (isParticipantArea) return NextResponse.redirect(new URL("/admin", request.url));
      if (isAdminLogin) return NextResponse.redirect(new URL("/admin", request.url));
      if (isAdminArea) return supabaseResponse;
    }
    if (demoRole === "participant") {
      if (isAdminArea) return NextResponse.redirect(new URL("/participant", request.url));
      if (isParticipantLogin) return NextResponse.redirect(new URL("/participant", request.url));
      if (isParticipantArea) return supabaseResponse;
    }
  }

  // Not signed in: allow public pages, redirect protected areas to login.
  if (!user) {
    if (isAdminArea && !isAdminLogin) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }
    if (isParticipantArea && !isParticipantLogin) {
      return NextResponse.redirect(new URL("/participant/login", request.url));
    }
    return supabaseResponse;
  }

  // Signed in: leave login pages for the correct console. An unprovisioned
  // account (no profile row) goes home instead of looping with the guard.
  if (isAdminLogin || isParticipantLogin) {
    const role = await getUserRole(supabase, user.id);
    const dest = role === "admin" ? "/admin" : role === "participant" ? "/participant" : "/";
    return NextResponse.redirect(new URL(dest, request.url));
  }

  // Admin area requires the admin role (defense in depth; RPCs re-check).
  // Unprovisioned accounts fail closed to the homepage, matching the client.
  if (isAdminArea) {
    const role = await getUserRole(supabase, user.id);
    if (role !== "admin") {
      return NextResponse.redirect(
        new URL(role === "participant" ? "/participant" : "/", request.url)
      );
    }
  }

  return supabaseResponse;
}

async function getUserRole(
  supabase: SupabaseClient,
  userId: string
): Promise<"admin" | "participant" | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (data?.role === "admin") return "admin";
  if (data?.role === "participant") return "participant";
  return null;
}
