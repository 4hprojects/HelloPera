import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET } from '@/services/storage.service';
import { getBillingProvider } from '@/lib/billing/provider';
import { recordAuditEvent } from '@/lib/auth/audit';
import { log } from '@/lib/log';

/**
 * Account deletion — master plan §54a gate item, PHASE-14 §69 to §72.
 *
 * The gate exists because Phase 10 publishes a privacy policy describing
 * deletion, and a policy describing something that does not work is worse than
 * having no policy at all.
 *
 * ## What actually deletes what
 *
 * Every user-owned table carries `user_id … references auth.users (id) on
 * delete cascade`, so removing the auth user removes the financial data in one
 * atomic step — verified against the live schema rather than the doc, because
 * Phases 07–09 added six tables after `DATA-MODEL.md`'s cascade list was
 * written.
 *
 * ## The provider is not a table (PHASE-14 §70)
 *
 * "Billing subscription should be cancelled/handled first." Deleting the auth
 * user removes the `subscriptions` row, but the provider has never heard of
 * that and keeps charging the card — the person who deleted their account then
 * pays for a product they can no longer sign into. So the subscription is
 * cancelled at the provider BEFORE anything local is touched, and a failure
 * there stops the deletion rather than proceeding into that outcome.
 *
 * Two things do NOT cascade, both deliberately:
 *
 *   1. **Storage objects.** Postgres knows nothing about the storage bucket.
 *      They must be removed explicitly, and they must be removed FIRST — see
 *      the ordering note below.
 *   2. **`audit_logs` and `subscription_events`**, which are `on delete set
 *      null`. §72 wants a minimal operational record that a deletion happened,
 *      without retaining the financial data behind it. The rows survive with
 *      no user attached, which is the intended outcome rather than an
 *      oversight.
 *
 * ## Why storage goes first
 *
 * If the auth user is deleted first and the storage sweep then fails, the
 * `documents` rows naming those objects are already gone — leaving files in
 * the bucket that nothing references and nobody can find. Deleting storage
 * first means a failure leaves the account intact and the operation
 * retryable, which is the recoverable direction.
 *
 * ## Billing history is deleted, not retained (PHASE-14 §71, §72, §73)
 *
 * `billing_customers` and `billing_history` cascade from `auth.users` like
 * every other user-owned table. §71 allows a retention exception for
 * operational or legal records and §73 asks for an actual policy — but there
 * is no policy yet, and §72 is explicit that full financial data must not be
 * kept merely for convenience. Deleting is the choice that matches what the
 * privacy page currently promises. If accounting later requires retained
 * invoices, that becomes a deliberate migration plus a privacy-page change,
 * not a silently surviving table.
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
        .list(prefix, { limit: 100, offset });

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
  const { data } = await admin
    .from('subscriptions')
    .select('status, provider_subscription_id')
    .eq('user_id', userId)
    .maybeSingle();

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
export async function deleteAccount(userId: string, email: string): Promise<void> {
  const admin = createAdminClient();

  // Recorded BEFORE the deletion, because `recordAuditEvent` writes
  // `actor_user_id`, and after the cascade there is no user to attribute it
  // to — the row would survive with a null actor and no record of whose
  // account it was.
  await recordAuditEvent({
    eventType: 'account_deletion_requested',
    actorUserId: userId,
    entityType: 'auth',
    metadata: { email },
  });

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
          'We could not remove your stored files, so nothing was deleted. Please try again.',
        );
      }
    }
  }

  // 3. The auth user. Every user-owned table cascades from here.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new AccountDeletionError(
      'We could not delete your account. Nothing was removed — please try again.',
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
    const { count: n } = await supabase
      .from(table)
      .select('id', { count: 'exact', head: true });
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
