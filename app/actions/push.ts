'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import type { ActionState } from '@/app/actions/auth';
import { pushSubscriptionSchema } from '@/schemas/notification.schema';
import { deletePushSubscription, savePushSubscription } from '@/services/push.service';
import { getPreferences, updatePreferences } from '@/services/notification.service';

/**
 * Push subscription actions — PHASE-08 §21, §25, §26.
 *
 * The browser cannot write `push_subscriptions` directly (§21): these actions
 * are the only path, and they validate the payload rather than trusting it.
 */

export async function subscribeToPushAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user, profile } = await requireUser();

  const parsed = pushSubscriptionSchema.safeParse({
    endpoint: formData.get('endpoint'),
    p256dh: formData.get('p256dh'),
    auth: formData.get('auth'),
    userAgent: formData.get('userAgent') ?? '',
  });
  if (!parsed.success) {
    return { error: 'That device could not be registered for notifications.' };
  }

  try {
    await savePushSubscription(user.id, parsed.data);

    // §13 — push is opt-in, and this is the moment it becomes real: a
    // permission grant plus a stored subscription. Enabling the preference
    // here rather than in the settings form means the toggle can never claim
    // push is on when no device could receive it.
    const prefs = await getPreferences(user.id, profile.timezone);
    if (!prefs.pushEnabled) {
      await updatePreferences(user.id, { ...prefs, pushEnabled: true });
    }
  } catch (error) {
    log.error('push: subscribe failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not turn on notifications for this device.' };
  }

  revalidatePath('/settings/notifications');
  return { success: 'Notifications are on for this device.' };
}

export async function unsubscribeFromPushAction(
  _p: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { user } = await requireUser();
  const endpoint = String(formData.get('endpoint') ?? '');
  if (!endpoint) return { error: 'That device could not be found.' };

  try {
    await deletePushSubscription(user.id, endpoint);
  } catch (error) {
    log.error('push: unsubscribe failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'We could not turn off notifications for this device.' };
  }

  revalidatePath('/settings/notifications');
  return { success: 'Notifications are off for this device.' };
}
