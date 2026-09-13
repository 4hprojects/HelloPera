import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/**
 * Session refresh — Phase 01 §30.
 *
 * Server Components cannot write cookies, so a token refreshed during a page
 * render is lost. Middleware runs before the render and can set cookies, which
 * is the only place a refreshed session can actually be persisted.
 *
 * This deliberately does NOT enforce authorization. Middleware runs on every
 * matched request and a mistake here fails open; the guards in lib/auth run
 * server-side per route and fail closed. Middleware keeps sessions alive,
 * guards decide access.
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() validates the JWT against the auth server and triggers refresh
  // when needed. Do not replace with getSession(), which trusts the cookie.
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except static assets and image files. Running on _next/static
     * would add an auth round trip to every chunk request for no benefit.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
