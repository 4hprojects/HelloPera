import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { isMaintenanceMode } from '@/lib/ops/kill-switches';
import {
  REQUEST_ID_HEADER,
  resolveRequestId,
  safeRouteLabel,
} from '@/lib/log/request-id';
import { logProxyRequest } from '@/lib/log/proxy';

/**
 * Session refresh — Phase 01 §30.
 *
 * Server Components cannot write cookies, so a token refreshed during a page
 * render is lost. Proxy runs before the render and can set cookies, which
 * is the only place a refreshed session can actually be persisted.
 *
 * This deliberately does NOT enforce authorization. Proxy runs on every
 * matched request and a mistake here fails open; the guards in lib/auth run
 * server-side per route and fail closed. Proxy keeps sessions alive,
 * guards decide access.
 */
export async function proxy(request: NextRequest) {
  const requestId = resolveRequestId(request.headers);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(REQUEST_ID_HEADER, requestId);

  logProxyRequest({
    requestId,
    method: request.method,
    route: safeRouteLabel(request.nextUrl.pathname),
  });

  /**
   * PHASE-14 §22 — maintenance, checked before anything else happens.
   *
   * Deliberately the first statement in the request path: it reads an
   * environment variable and returns, with no Supabase call, so the site stays
   * up and honest even when the database is the thing that is broken. See
   * `lib/ops/kill-switches.ts` for why this one is not a feature flag.
   *
   * `/api/health` is exempt, or the platform's own probe would read a
   * maintenance page as a healthy response and never restart anything.
   */
  if (isMaintenanceMode() && !request.nextUrl.pathname.startsWith('/api/health')) {
    return new NextResponse(MAINTENANCE_PAGE, {
      status: 503,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        // Tell crawlers and caches this is temporary. A 503 cached as
        // permanent is how a maintenance window costs search rankings.
        'retry-after': '600',
        'cache-control': 'no-store',
        [REQUEST_ID_HEADER]: requestId,
      },
    });
  }

  const nextResponse = () => {
    const next = NextResponse.next({ request: { headers: requestHeaders } });
    next.headers.set(REQUEST_ID_HEADER, requestId);
    return next;
  };

  let response = nextResponse();
  // Health probes must not depend on Auth availability or session cookies.
  if (
    request.nextUrl.pathname === '/api/health' ||
    request.nextUrl.pathname === '/api/health/ready'
  )
    return response;

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
        response = nextResponse();
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

/**
 * Inline, with no imports and no styling framework.
 *
 * Maintenance mode has to work when the application does not, so this page
 * must not depend on a build artifact, a font, a stylesheet or a database. It
 * is a string.
 */
const MAINTENANCE_PAGE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>HelloPera is back shortly</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0; min-height: 100dvh; display: grid; place-items: center;
    padding: 24px; background: #f4f8f7; color: #132238;
    font: 16px/1.6 system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main { max-width: 26rem; text-align: center; }
  h1 { font-size: 1.5rem; margin: 0 0 8px; }
  p { margin: 0 0 8px; color: #445; }
  @media (prefers-color-scheme: dark) {
    body { background: #0e1a2b; color: #e8eef5; }
    p { color: #a9b6c6; }
  }
</style>
</head>
<body>
<main>
  <h1>HelloPera is back shortly</h1>
  <p>We are doing some maintenance. Nothing you have recorded is affected.</p>
  <p>Please try again in a few minutes.</p>
</main>
</body>
</html>`;

export const config = {
  matcher: [
    /*
     * Everything except static assets and crawler files. Running on
     * _next/static would add an auth round trip to every chunk request for no
     * benefit.
     *
     * PHASE-10 §63 — robots.txt, sitemap.xml and ads.txt are excluded for the
     * same reason plus one more: they are fetched by crawlers that have no
     * session to refresh, so every request would spend a Supabase round trip
     * resolving a user who does not exist. On a site that wants to be crawled,
     * that is the traffic you least want to make expensive.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|robots.txt|sitemap.xml|ads.txt|sw.js|opengraph-image|twitter-image|apple-icon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|xml)$).*)',
  ],
};
