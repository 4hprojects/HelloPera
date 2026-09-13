import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAuditEvent } from '@/lib/auth/audit';
import { log } from '@/lib/log';

/**
 * Auth callback — handles email verification, OAuth return, and password
 * recovery links (§17, §19).
 *
 * Runs server-side so the code-for-session exchange happens where the cookie
 * can actually be written.
 */
/**
 * Resolve the externally visible origin.
 *
 * `new URL(request.url).origin` is the address the container was reached on —
 * behind HelloDeploy's nginx that is the internal bind address, so redirects
 * built from it send users to something like http://0.0.0.0:3000. Prefer the
 * forwarded headers the proxy sets, then the configured app URL.
 */
function resolveOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const host = forwardedHost ?? request.headers.get('host');
  if (host) {
    const proto = request.headers.get('x-forwarded-proto') ?? 'https';
    return `${proto}://${host}`;
  }
  return process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = resolveOrigin(request);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Only same-origin relative paths. An open redirect here would be handed a
  // valid session, which makes it considerably worse than the usual case.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';

  if (errorParam) {
    log.warn('auth callback returned an error', { error: errorParam });
    // access_denied is the user pressing cancel — not an error worth a scary page.
    if (errorParam === 'access_denied') {
      return NextResponse.redirect(`${origin}/login?cancelled=1`);
    }
    return NextResponse.redirect(
      `${origin}/auth/error?reason=${encodeURIComponent(errorDescription ?? errorParam)}`,
    );
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/auth/error?reason=missing_code`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    log.warn('code exchange failed', { code: error?.code ?? 'unknown' });
    return NextResponse.redirect(`${origin}/auth/error?reason=exchange_failed`);
  }

  // Status gate before any authenticated page renders.
  //
  // The session client, not the service role: the exchange above established
  // a session, and RLS grants SELECT on own profile. Least privilege, and it
  // keeps the callback working before the service-role key is configured.
  const { data: profile } = await supabase
    .from('profiles')
    .select('status')
    .eq('id', data.user.id)
    .maybeSingle<{ status: string }>();

  const isOAuth = data.user.app_metadata?.provider === 'google';
  if (isOAuth) {
    await recordAuditEvent({
      eventType: 'google_oauth_login',
      actorUserId: data.user.id,
      metadata: { method: 'google' },
    });
  }

  if (profile?.status === 'suspended') {
    return NextResponse.redirect(`${origin}/account-suspended`);
  }
  if (profile?.status === 'disabled') {
    return NextResponse.redirect(`${origin}/account-disabled`);
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
