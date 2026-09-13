'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { notificationPreferencesSchema } from '@/schemas/notification.schema';
import {
  getPreferences,
  markAllRead,
  markRead,
  updatePreferences,
} from '@/services/notification.service';

/**
 * Notification actions — PHASE-08 §21, §50.
 *
 * Marking read goes through a server action rather than an RLS UPDATE policy:
 * no Postgres policy can be restricted to a single column, so a policy
 * permitting `read_at` would permit the whole row.
 */

function fieldErrorsFrom(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}) {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function revalidateAll(): void {
  revalidatePath('/notifications');
  revalidatePath('/settings/notifications');
  // The badge lives in the app shell, so every authenticated route shows it.
  revalidatePath('/', 'layout');
}

export async function markNotificationReadAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireUser();
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: 'That notification could not be found.' };

  try {
    await markRead(id);
  } catch (error) {
    log.error('notifications: mark read failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not update that notification. Please try again.' };
  }

  revalidateAll();
  return { success: 'Marked as read.' };
}

export async function markAllNotificationsReadAction(
  _p: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();

  let count = 0;
  try {
    count = await markAllRead(user.id);
  } catch (error) {
    log.error('notifications: mark all read failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not update your notifications. Please try again.' };
  }

  revalidateAll();
  return {
    success:
      count === 0
        ? 'Nothing unread.'
        : `Marked ${count} ${count === 1 ? 'notification' : 'notifications'} as read.`,
  };
}

export async function updateNotificationPreferencesAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();

  const parsed = notificationPreferencesSchema.safeParse({
    billDueSoon: formData.get('billDueSoon') ?? '',
    billOverdue: formData.get('billOverdue') ?? '',
    receivableDueSoon: formData.get('receivableDueSoon') ?? '',
    receivableOverdue: formData.get('receivableOverdue') ?? '',
    expectedIncome: formData.get('expectedIncome') ?? '',
    recurringEvents: formData.get('recurringEvents') ?? '',
    ocrReview: formData.get('ocrReview') ?? '',
    forecastShortfall: formData.get('forecastShortfall') ?? '',
    inAppEnabled: formData.get('inAppEnabled') ?? '',
    pushEnabled: formData.get('pushEnabled') ?? '',
    quietHoursEnabled: formData.get('quietHoursEnabled') ?? '',
    quietHoursStart: formData.get('quietHoursStart') || '22:00',
    quietHoursEnd: formData.get('quietHoursEnd') || '07:00',
    timezone: formData.get('timezone') || profile.timezone,
  });
  if (!parsed.success) return { fieldErrors: fieldErrorsFrom(parsed.error) };

  try {
    // §13 — push cannot be switched on from this form alone. The browser
    // permission and a stored subscription are what enable it; a checkbox
    // that claimed otherwise would promise notifications that never arrive.
    const current = await getPreferences(user.id, profile.timezone);
    await updatePreferences(user.id, {
      ...parsed.data,
      pushEnabled: parsed.data.pushEnabled && current.pushEnabled,
    });
  } catch (error) {
    log.error('notifications: preferences update failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not save your preferences. Please try again.' };
  }

  revalidateAll();
  return { success: 'Preferences saved.' };
}
