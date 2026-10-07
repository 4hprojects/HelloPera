'use server';

import { revalidatePath } from 'next/cache';
import { flagInfo } from '@/lib/admin/flag-catalog';
import { adminAction, AdminActionError, rejectSelfTarget } from '@/lib/auth/admin';
import { log } from '@/lib/log';
import { ENTITLEMENT_KEYS } from '@/lib/monetization/entitlements';
import { METERED_FEATURES } from '@/lib/monetization/limits';
import type { ActionState } from '@/app/actions/auth';
import { formRejected, REJECTED_FORM } from '@/lib/validation/form';
import { FORMS } from '@/schemas/forms';

/**
 * Admin mutations — PHASE-13 §70, §72, §73, §74.
 *
 * Server actions rather than route handlers, so CSRF protection and the
 * POST-only guarantee come from the framework (§73) instead of being
 * re-implemented per endpoint.
 *
 * §72 says "validate admin on every request", and `adminAction()` is how: it
 * is the only thing in this file that touches authorization, and it cannot be
 * called without also supplying the audit event and the reason. Every function
 * below is a thin shell around it.
 *
 * There is deliberately no general-purpose endpoint here — nothing that takes a
 * table name, a column, or a filter. §70: *"An admin API that accepts a table
 * name and a filter is a backdoor into every user's finances, however carefully
 * it is called today."*
 */

const CONFIRM = 'CONFIRM';

function fail(error: unknown): ActionState {
  if (error instanceof AdminActionError) return { error: error.message };
  log.error('admin action failed', {
    m: error instanceof Error ? error.message : 'unknown',
  });
  return { error: 'That did not work. Nothing was changed.' };
}

/**
 * §74 — a typed confirmation for destructive actions.
 *
 * The same shape `app/actions/account.ts` uses for deletion. A button alone is
 * one mis-click away from suspending a customer.
 */
function requireConfirmation(formData: FormData): void {
  if (String(formData.get('confirmation') ?? '').trim() !== CONFIRM) {
    throw new AdminActionError(`Type ${CONFIRM} to confirm.`, 'NOT_CONFIRMED');
  }
}

export async function setUserStatusAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.setUserStatus, 'setUserStatusAction'))
    return { error: REJECTED_FORM };
  try {
    const userId = String(formData.get('userId') ?? '');
    const status = String(formData.get('status') ?? '');

    if (status !== 'active' && status !== 'suspended' && status !== 'disabled') {
      throw new AdminActionError('That is not a valid status.');
    }

    // Reactivation is the one status change that is not destructive, so it
    // does not demand a typed confirmation — restoring access by mistake is
    // recoverable in a way that removing it is not.
    if (status !== 'active') requireConfirmation(formData);

    const event =
      status === 'suspended'
        ? 'user_suspended'
        : status === 'disabled'
          ? 'user_disabled'
          : 'user_reactivated';

    await adminAction({
      event,
      reason: formData.get('reason'),
      targetUserId: userId,
      metadata: { status },
      // §14 — an admin suspending themselves locks the only operator out.
      precheck: (context) => rejectSelfTarget(context, userId),
      operation: 'set_status',
      args: { status },
    });

    revalidatePath('/admin/users');
    revalidatePath(`/admin/users/${userId}`);
    return { success: `Status changed to ${status}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function setUserRoleAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.setUserRole, 'setUserRoleAction'))
    return { error: REJECTED_FORM };
  try {
    const userId = String(formData.get('userId') ?? '');
    const role = String(formData.get('role') ?? '');

    if (role !== 'user' && role !== 'admin') {
      throw new AdminActionError('That is not a valid role.');
    }

    requireConfirmation(formData);

    await adminAction({
      event: 'role_changed',
      reason: formData.get('reason'),
      targetUserId: userId,
      metadata: { role },
      // §13, §14 — the escalation this exists to prevent is an admin
      // changing their own privileges, and at that moment "are you an admin"
      // is true by definition. So the check is "is this your own account".
      precheck: (context) => rejectSelfTarget(context, userId),
      operation: 'set_role',
      args: { role },
    });

    revalidatePath(`/admin/users/${userId}`);
    return { success: `Role changed to ${role}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function addSupportNoteAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.addSupportNote, 'addSupportNoteAction'))
    return { error: REJECTED_FORM };
  try {
    const userId = String(formData.get('userId') ?? '');
    const note = String(formData.get('note') ?? '').trim();

    if (note.length < 3) throw new AdminActionError('Write a note first.');
    if (note.length > 4000) throw new AdminActionError('That note is too long.');

    await adminAction({
      event: 'support_note_added',
      // A note is its own reason; asking for a second one twice over is the
      // kind of friction that gets worked around with "see note".
      reason: note.slice(0, 200),
      targetUserId: userId,
      operation: 'add_note',
      args: { note },
    });

    revalidatePath(`/admin/users/${userId}`);
    return { success: 'Note saved.' };
  } catch (error) {
    return fail(error);
  }
}

export async function setFlagAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.setFlag, 'setFlagAction'))
    return { error: REJECTED_FORM };
  try {
    const key = String(formData.get('key') ?? '');
    const enabled = String(formData.get('enabled') ?? '') === 'true';

    // §36 — a kill switch is exactly the control that must not be flipped by a
    // stray click, in either direction.
    requireConfirmation(formData);

    await adminAction({
      event: 'feature_flag_changed',
      reason: formData.get('reason'),
      metadata: { key, enabled },
      operation: 'set_flag',
      args: { key, enabled },
    });

    revalidatePath('/admin/feature-flags');
    return { success: `${flagInfo(key).title} is now ${enabled ? 'on' : 'off'}.` };
  } catch (error) {
    return fail(error);
  }
}

export async function grantOverrideAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.grantOverride, 'grantOverrideAction'))
    return { error: REJECTED_FORM };
  try {
    const userId = String(formData.get('userId') ?? '');
    const key = String(formData.get('entitlementKey') ?? '');
    const rawValue = String(formData.get('value') ?? '').trim();
    const endsAt = String(formData.get('endsAt') ?? '').trim() || null;

    if (!(ENTITLEMENT_KEYS as readonly string[]).includes(key)) {
      throw new AdminActionError('That is not an entitlement key.');
    }

    // The value is typed by what the key means, not by what was typed. A
    // string "true" resolving to a boolean entitlement would silently fall
    // back to Free's value and look like the override failing.
    let value: unknown;
    if (rawValue === 'true' || rawValue === 'false') value = rawValue === 'true';
    else if (rawValue === 'null') value = null;
    else if (/^-?\d+$/.test(rawValue)) value = Number(rawValue);
    else throw new AdminActionError('Use true, false, null, or a whole number.');

    await adminAction({
      event: 'entitlement_override_granted',
      reason: formData.get('reason'),
      targetUserId: userId,
      metadata: { key, value: String(rawValue), endsAt },
      operation: 'grant_override',
      args: { key, value, endsAt },
    });

    revalidatePath(`/admin/users/${userId}`);
    return { success: 'Override granted.' };
  } catch (error) {
    return fail(error);
  }
}

export async function revokeOverrideAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.revokeOverride, 'revokeOverrideAction'))
    return { error: REJECTED_FORM };
  try {
    const overrideId = String(formData.get('overrideId') ?? '');
    const userId = String(formData.get('userId') ?? '');

    await adminAction({
      event: 'entitlement_override_revoked',
      reason: formData.get('reason'),
      targetUserId: userId,
      entityId: overrideId,
      operation: 'revoke_override',
    });

    revalidatePath(`/admin/users/${userId}`);
    return { success: 'Override ended.' };
  } catch (error) {
    return fail(error);
  }
}

export async function adjustUsageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.adjustUsage, 'adjustUsageAction'))
    return { error: REJECTED_FORM };
  try {
    const userId = String(formData.get('userId') ?? '');
    const featureKey = String(formData.get('featureKey') ?? '');
    const delta = Number(String(formData.get('quantityDelta') ?? ''));

    if (!(METERED_FEATURES as readonly string[]).includes(featureKey)) {
      throw new AdminActionError('That is not a metered feature.');
    }
    if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 1000) {
      throw new AdminActionError('Use a whole number between -1000 and 1000, not zero.');
    }

    await adminAction({
      event: 'usage_adjusted',
      reason: formData.get('reason'),
      targetUserId: userId,
      metadata: { featureKey, delta },
      operation: 'adjust_usage',
      args: { featureKey, delta },
    });

    revalidatePath(`/admin/users/${userId}`);
    revalidatePath('/admin/usage');
    return { success: 'Adjustment recorded.' };
  } catch (error) {
    return fail(error);
  }
}

/**
 * §66 — repair one account's cached balance.
 *
 * Narrow, deterministic, reasoned and audited, which are §66's four
 * requirements. It goes through `adminAction()` like every other admin
 * mutation, so the audit cannot be skipped — and the previous and corrected
 * values land in the record, because "the balance was wrong and I fixed it" is
 * not a useful thing to read six months later.
 */
export async function repairBalanceAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.repairBalance, 'repairBalanceAction'))
    return { error: REJECTED_FORM };
  try {
    const accountId = String(formData.get('accountId') ?? '');
    const userId = String(formData.get('userId') ?? '') || null;

    requireConfirmation(formData);

    const result = await adminAction({
      event: 'balance_repaired',
      reason: formData.get('reason'),
      targetUserId: userId,
      entityId: accountId,
      operation: 'repair_balance',
    });

    revalidatePath('/admin/integrity');
    return {
      success: `Corrected ${String(result.previous)} to ${String(result.corrected)}.`,
    };
  } catch (error) {
    return fail(error);
  }
}

/** §65 — run the nightly report now. */
export async function runIntegrityCheckAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (formRejected(formData, FORMS.admin.runIntegrityCheck, 'runIntegrityCheckAction'))
    return { error: REJECTED_FORM };
  try {
    const result = await adminAction({
      event: 'integrity_check_run',
      reason: formData.get('reason'),
      operation: 'integrity_check',
    });

    const mismatches = Number(result.mismatches ?? 0);
    revalidatePath('/admin/integrity');
    return {
      success:
        mismatches === 0
          ? 'No mismatches found.'
          : `${mismatches} mismatch${mismatches === 1 ? '' : 'es'} found.`,
    };
  } catch (error) {
    return fail(error);
  }
}
