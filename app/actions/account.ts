'use server';

import { enforceRateLimit, RateLimitError } from '@/services/rate-limit.service';
import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { DELETION_COOKIE, deletionTokenHash } from '@/lib/auth/deletion-token';
import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/guards';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { AccountDeletionError, deleteAccount } from '@/services/account-deletion.service';

/**
 * Account deletion — master plan §54a gate item, PHASE-14 §69, §70.
 *
 * §70 requires recent authentication, explicit confirmation, and no one-click
 * accidental deletion. All three are enforced here rather than in the service,
 * because this is the only layer that holds the user's credentials.
 */

/** The word the user must type. Deliberately not "yes" or "confirm". */
const CONFIRMATION = 'DELETE';

export async function deleteAccountAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  try {
    await enforceRateLimit('login', `deletion:${user.id}`);
  } catch (error) {
    if (error instanceof RateLimitError) return { error: error.userMessage };
    throw error;
  }
  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '').trim();

  if (confirmation !== CONFIRMATION) {
    return {
      fieldErrors: { confirmation: `Type ${CONFIRMATION} to confirm.` },
    };
  }

  const supabase = await createClient();
  const cookieStore = await cookies();
  const token = cookieStore.get(DELETION_COOKIE)?.value;
  const useGoogle = user.app_metadata?.provider === 'google';
  let challengeHash: string | null = null;
  if (useGoogle) {
    if (!token) return { error: 'Verify with Google before confirming deletion.' };
    challengeHash = deletionTokenHash(token);
  } else {
    if (!password || !user.email)
      return { fieldErrors: { password: 'Enter your password to continue.' } };
    const { data, error } = await supabase.auth.signInWithPassword({
      email: user.email,
      password,
    });
    if (error || data.user?.id !== user.id)
      return { fieldErrors: { password: 'That password is not correct.' } };
  }

  try {
    await deleteAccount(user.id, challengeHash);
    cookieStore.delete(DELETION_COOKIE);
  } catch (error) {
    if (error instanceof AccountDeletionError) return { error: error.message };
    log.error('account deletion failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return {
      error:
        'Deletion did not finish. Some files may already be removed. Retry deletion to finish.',
    };
  }

  // The session now belongs to a user that no longer exists. Clearing it
  // locally avoids a confusing bounce through a guard that cannot load a
  // profile.
  await supabase.auth.signOut();

  redirect('/?deleted=1');
}

/** A fresh provider round-trip, bound to this browser and this exact account. */
export async function startGoogleDeletionAction(): Promise<void> {
  const { user } = await requireUser();
  await enforceRateLimit('login', `deletion:${user.id}`);
  const token = randomBytes(32).toString('hex');
  const { error } = await createAdminClient()
    .from('deletion_challenges')
    .insert({
      token_hash: deletionTokenHash(token),
      user_id: user.id,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
  if (error) throw new Error('Identity verification could not start. Please try again.');
  const cookieStore = await cookies();
  cookieStore.set(DELETION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  const supabase = await createClient();
  const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${appUrl()}/auth/callback?next=/settings/delete&deletion=1`,
      queryParams: { prompt: 'select_account', max_age: '0' },
    },
  });
  if (oauthError || !data.url)
    throw new Error('Google verification could not start. Please try again.');
  redirect(data.url);
}
