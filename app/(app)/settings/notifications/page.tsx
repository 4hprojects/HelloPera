import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { PreferencesForm } from '@/components/notifications/preferences-form';
import { requireUser } from '@/lib/auth/guards';
import { getPreferences } from '@/services/notification.service';
import { listPushDevices } from '@/services/push.service';
import { PushOptIn } from '@/components/notifications/push-opt-in';
import { env, isPushConfigured } from '@/lib/env';

export const metadata: Metadata = { title: 'Notification settings' };

/** §50, §51 — /settings/notifications. */
export default async function NotificationSettingsPage() {
  const { user, profile } = await requireUser();

  const [preferences, devices] = await Promise.all([
    getPreferences(user.id, profile.timezone),
    listPushDevices(user.id),
  ]);

  const active = devices.filter((d) => d.isActive);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Notifications"
        description="Choose what HelloPera tells you about, and when."
        actions={
          <Link href="/notifications" className={buttonClass('ghost', 'sm')}>
            View all
          </Link>
        }
      />

      <Card className="mb-4">
        <PreferencesForm preferences={preferences} pushSupported={active.length > 0} />
      </Card>

      {/*
        §51 — device management. Shows what the user needs to recognise a
        device and revoke it; never the encryption keys, which §25 keeps
        server-side even from their owner.
      */}
      <Card>
        <h2 className="hp-h3 mb-1 text-text">Devices</h2>
        <p className="hp-small mb-3 text-text-muted">
          Push notifications go to devices where you have allowed them.
        </p>

        {/*
          §55 — only the PUBLIC key crosses to the client, and only when push
          is actually configured. Null tells the component to explain that
          push is unavailable rather than offer a button that cannot work.
        */}
        <PushOptIn
          vapidPublicKey={
            isPushConfigured() ? (env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null) : null
          }
        />

        {active.length === 0 ? (
          <p className="hp-body text-text-muted">
            No devices yet. Open HelloPera on the device you want reminders on and allow
            notifications when asked.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {active.map((d) => (
              <li key={d.id} className="py-3">
                <p className="hp-body truncate font-medium text-text">
                  {d.userAgent ?? 'Unknown device'}
                </p>
                <p className="mt-0.5 text-xs text-text-muted">
                  Added {new Date(d.createdAt).toLocaleDateString()}
                  {d.lastSuccessAt
                    ? ` · last reminder ${new Date(d.lastSuccessAt).toLocaleDateString()}`
                    : ' · no reminders sent yet'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
