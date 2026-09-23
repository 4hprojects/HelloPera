import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { recordAuditEvent } from '@/lib/auth/audit';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  DELETION_COOKIE,
  deletionTokenHash,
  validDeletionChallenge,
  freshOAuthExchange,
} from '@/lib/auth/deletion-token';
import { appUrl } from '@/lib/env';
import { log } from '@/lib/log';

/**
 * Auth callback — handles email verification, OAuth return, and password
 * recovery links (§17, §19).
 *
 * Runs server-side so the code-for-session exchange happens where the cookie
 * can actually be written.
 */
// Use the configured canonical origin; forwarded headers are not redirect authority.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const origin = appUrl();
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/dashboard';
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Only same-origin relative paths. An open redirect here would be handed a
  // valid session, which makes it considerably worse than the usual case.
  const safeNext =
    next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')
      ? next
      : '/dashboard';

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

  if (searchParams.get('deletion') === '1') {
    const token = request.cookies.get(DELETION_COOKIE)?.value;
    const admin = createAdminClient();
    const hash = token ? deletionTokenHash(token) : '';
    const { data: challenge, error: challengeError } = await admin
      .from('deletion_challenges')
      .select('user_id, created_at, expires_at, consumed_at')
      .eq('token_hash', hash)
      .maybeSingle();
    if (
      challengeError ||
      !validDeletionChallenge(challenge, data.user.id) ||
      data.user.app_metadata?.provider !== 'google' ||
      !freshOAuthExchange(data.session?.access_token, challenge?.created_at ?? '')
    ) {
      return NextResponse.redirect(`${origin}/settings/delete?verification=failed`);
    }
    const { error: approvalError } = await admin
      .from('deletion_challenges')
      .update({ approved_at: new Date().toISOString() })
      .eq('token_hash', hash)
      .is('consumed_at', null);
    if (approvalError)
      return NextResponse.redirect(`${origin}/settings/delete?verification=failed`);
    return NextResponse.redirect(`${origin}/settings/delete?verification=complete`);
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
