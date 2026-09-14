import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel, SectionCard } from '@/components/ui/card';
import { requireAdmin } from '@/lib/auth/guards';
import { getNotificationOverview } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Notifications · Admin' };

/**
 * /admin/notifications — PHASE-13 §31, §32.
 *
 * Delivery health, never message content. `notifications.title` and `.message`
 * are assembled from someone's own bills and balances — Phase 08 §22 strips
 * amounts from push copy for exactly this reason — and neither column is read.
 */
export default async function AdminNotificationsPage() {
  await requireAdmin();
  const overview = await getNotificationOverview();

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Delivery state. Message contents are never shown here."
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <Card>
          <CardLabel>Active push devices</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">
            {overview.push.active}
          </p>
        </Card>
        <Card>
          <CardLabel>Devices with failures</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">
            {overview.push.failing}
          </p>
        </Card>
      </div>

      {(
        [
          ['By delivery status', overview.byDeliveryStatus],
          ['By type', overview.byType],
          ['By channel', overview.byChannel],
        ] as const
      ).map(([title, rows]) => (
        <SectionCard key={title} title={title} className="mb-3">
          {rows.length === 0 ? (
            <p className="hp-small text-text-muted">Nothing yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li key={row.value} className="flex justify-between gap-3 py-2">
                  <span className="hp-small text-text-muted">
                    {row.value.replace(/_/g, ' ')}
                  </span>
                  <span className="hp-small tabular-nums text-text">{row.count}</span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      ))}
    </div>
  );
}
