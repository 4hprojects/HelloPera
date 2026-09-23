import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';
import { getBillingProvider } from '@/lib/billing/provider';
import { log } from '@/lib/log';

/**
 * Deletion is a resumable operation across billing, storage, and Auth.
 * begin_account_deletion freezes new financial/storage writes before the sweep.
 * Files are removed before Auth; an interrupted sweep leaves the user able to
 * reauthenticate and retry. The Auth deletion trigger removes identifying audit
 * history and leaves one anonymous event. No failure claims a distributed rollback.
 */

export class AccountDeletionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountDeletionError';
  }
}

/**
 * Every storage object belonging to a user.
 *
 * Listed from the bucket rather than derived from `documents` rows, so an
 * object orphaned by an earlier failed upload is still removed. Paths are
 * `<user_uuid>/<year>/<month>/<document>/<rendition>`, so the sweep recurses.
 */
async function listUserObjects(userId: string): Promise<string[]> {
  const admin = createAdminClient();
  const found: string[] = [];

  // Breadth-first over the prefix tree. Supabase's list() is one level at a
  // time and caps at 100 by default, so both the depth and the page size have
  // to be handled explicitly.
  const queue: string[] = [userId];

  while (queue.length > 0) {
    const prefix = queue.shift()!;
    let offset = 0;

    for (;;) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });

      if (error) {
        throw new AccountDeletionError(
          `We could not read your stored files: ${error.message}`,
        );
      }

      const entries = data ?? [];
      for (const entry of entries) {
        const path = `${prefix}/${entry.name}`;
        // A folder has no id; a file does. That is the only distinction the
        // storage API offers.
        if (entry.id === null) queue.push(path);
        else found.push(path);
      }

      if (entries.length < 100) break;
      offset += entries.length;
    }
  }

  return found;
}

/**
 * PHASE-14 §70 — stop the money before removing the account.
 *
 * Silent when there is nothing to cancel: a Free user, or a deployment with no
 * provider configured, must not be blocked from deleting their account by a
 * billing system that was never switched on.
 *
 * A provider that IS live and refuses is a hard stop. The alternative is
 * deleting the account and leaving a live subscription charging a card that
 * nobody can now find the owner of, which is the failure worth refusing.
 */
async function cancelBillingAtProvider(userId: string): Promise<void> {
  const provider = getBillingProvider();
  if (!provider.isLive) return;

  const admin = createAdminClient();
  const { data, error: lookupError } = await admin
    .from('subscriptions')
    .select('status, provider_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (lookupError)
    throw new AccountDeletionError(
      'Your subscription could not be checked. Retry deletion later.',
    );
  const id = data?.provider_subscription_id;
  if (!data || typeof id !== 'string' || !id) return;

  // Already finished. Cancelling again would be an error at most providers.
  if (data.status === 'expired' || data.status === 'inactive') return;

  try {
    await provider.cancelSubscription(id);
  } catch (error) {
    log.error('account deletion: provider cancellation failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    throw new AccountDeletionError(
      'We could not cancel your subscription with our payment provider, so nothing was deleted. Please contact support.',
    );
  }
}

/**
 * Delete the account and everything it owns.
 *
 * Callers must have re-authenticated the user first (§70). This function does
 * not check that, because it cannot — the password check belongs in the action
 * where the credentials are.
 */
export async function deleteAccount(
  userId: string,
  challengeHash: string | null = null,
): Promise<void> {
  const admin = createAdminClient();
  const { error: beginError } = await admin.rpc('begin_account_deletion', {
    p_user_id: userId,
    p_challenge_hash: challengeHash,
  });
  if (beginError)
    throw new AccountDeletionError(
      'Please verify your identity again before deleting your account.',
    );
  // 1. The provider, before anything local (§70). Nothing has been destroyed
  //    at this point, so a failure here is fully recoverable — which is why it
  //    goes first rather than after the cascade that would hide the evidence.
  await cancelBillingAtProvider(userId);

  // 2. Storage — see the header. A failure here leaves the account
  //    intact and the operation retryable.
  const objects = await listUserObjects(userId);
  if (objects.length > 0) {
    // remove() takes a bounded list; chunk it rather than assuming.
    for (let i = 0; i < objects.length; i += 100) {
      const chunk = objects.slice(i, i + 100);
      const { error } = await admin.storage.from(BUCKET).remove(chunk);
      if (error) {
        throw new AccountDeletionError(
          'We could not remove your stored files, Deletion is incomplete; some files may already be removed. Your account is read-only. Retry deletion to finish.',
        );
      }
    }
  }

  const { error: stageError } = await admin
    .from('account_deletions')
    .update({ stage: 'auth' })
    .eq('user_id', userId);
  if (stageError)
    throw new AccountDeletionError('Deletion is incomplete. Retry deletion to finish.');

  // 3. The auth user. Every user-owned table cascades from here.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new AccountDeletionError(
      'Your files were removed, but account deletion is incomplete. Your account is read-only. Retry deletion to finish.',
    );
  }

  log.info('account deleted', { objects: objects.length });
}

/**
 * What the user is about to lose, counted before they confirm (§69).
 *
 * "Explain consequences" is a step in the workflow, and a number is a more
 * honest explanation than a paragraph. Read through the RLS-scoped client, so
 * these are the user's own rows by construction.
 */
export async function getDeletionSummary(): Promise<{
  accounts: number;
  transactions: number;
  documents: number;
  obligations: number;
}> {
  const supabase = await createClient();

  const count = async (table: string): Promise<number> => {
    const { count: n, error } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true });
    if (error)
      throw new AccountDeletionError(
        'We could not count your records. Please try again.',
      );
    return n ?? 0;
  };

  const [accounts, transactions, documents, bills, receivables, expected] =
    await Promise.all([
      count('accounts'),
      count('transactions'),
      count('documents'),
      count('bills'),
      count('receivables'),
      count('expected_income'),
    ]);

  return {
    accounts,
    transactions,
    documents,
    obligations: bills + receivables + expected,
  };
}
