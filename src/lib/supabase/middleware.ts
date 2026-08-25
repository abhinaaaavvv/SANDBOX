import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refreshes the Supabase session on each request.
 *
 * This ensures:
 * - Session tokens are refreshed before expiry
 * - Auth state is consistent across server/client
 * - Protected routes can be validated server-side
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Protected routes that require authentication
  const isProtectedRoute =
    pathname.startsWith("/participant") || pathname.startsWith("/admin");

  // Login routes (not protected)
  const isLoginRoute =
    pathname === "/participant/login" || pathname === "/admin/login";

  // Public routes never make an auth decision here, so skip the Supabase
  // client entirely — getUser() is a network round-trip to Supabase Auth
  // that would otherwise sit on the TTFB of every public page.
  // (Client-side sign-in/refresh still runs through supabase-js directly.)
  if (!isProtectedRoute || isLoginRoute) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this is critical for token refresh
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If accessing a protected route without auth, redirect to the appropriate login
  if (!user) {
    const url = request.nextUrl.clone();
    if (pathname.startsWith("/admin")) {
      url.pathname = "/admin/login";
    } else {
      url.pathname = "/participant/login";
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
