'use server';

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

  const password = String(formData.get('password') ?? '');
  const confirmation = String(formData.get('confirmation') ?? '').trim();

  if (confirmation !== CONFIRMATION) {
    return {
      fieldErrors: { confirmation: `Type ${CONFIRMATION} to confirm.` },
    };
  }

  if (!password) {
    return { fieldErrors: { password: 'Enter your password to continue.' } };
  }

  const email = user.email;
  if (!email) {
    // An OAuth-only account has no password to re-check. Refusing is the
    // honest answer rather than deleting on a weaker check than everyone else
    // gets; a Google-account deletion path needs its own re-auth and belongs
    // with the work that can test it.
    return {
      error:
        'Accounts created with Google cannot be deleted here yet. Please contact support.',
    };
  }

  // §70 — recent authentication. Re-checking the password immediately before
  // an irreversible action is what stops an unattended session from being
  // enough to destroy someone's records.
  const supabase = await createClient();
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (reauthError) {
    log.warn('account deletion: re-authentication failed');
    return { fieldErrors: { password: 'That password is not correct.' } };
  }

  try {
    await deleteAccount(user.id, email);
  } catch (error) {
    if (error instanceof AccountDeletionError) return { error: error.message };
    log.error('account deletion failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return {
      error: 'We could not delete your account. Nothing was removed — please try again.',
    };
  }

  // The session now belongs to a user that no longer exists. Clearing it
  // locally avoids a confusing bounce through a guard that cannot load a
  // profile.
  await supabase.auth.signOut();

  redirect('/?deleted=1');
}
