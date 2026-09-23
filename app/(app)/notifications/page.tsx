import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SectionCard } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { NotificationList } from '@/components/notifications/notification-list';
import { MarkAllRead } from '@/components/notifications/mark-all-read';
import { requireUser } from '@/lib/auth/guards';
import {
  generateNotifications,
  listNotifications,
} from '@/services/notification.service';

export const metadata: Metadata = { title: 'Notifications' };

const PAGE_SIZE = 30;

/**
 * /notifications — PHASE-08 §19, §67.
 *
 * Runs a user-scoped generation on load (§19's lazy safety check): pg_cron
 * generates hourly, but a notification centre that is empty because cron could
 * not be enabled is worse than one that costs a scoped call to open.
 */
export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { user } = await requireUser();
  const params = await searchParams;

  const raw = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(raw) || 1);

  await generateNotifications(user.id);
  const { items, hasNext } = await listNotifications(PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const unread = items.filter((n) => n.readAt === null).length;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Notifications"
        description="Reminders about your money. Nothing here changes a record on its own."
        actions={
          <Link href="/settings/notifications" className={buttonClass('ghost', 'sm')}>
            Settings
          </Link>
        }
      />

      <SectionCard
        title={unread ? `${unread} unread` : 'All caught up'}
        action={<MarkAllRead disabled={unread === 0} />}
      >
        <NotificationList items={items} />
      </SectionCard>

      {page > 1 || hasNext ? (
        <nav
          aria-label="Notification pages"
          className="mt-4 flex items-center justify-between"
        >
          {page > 1 ? (
            <Link
              href={`/notifications?page=${page - 1}`}
              className={buttonClass('ghost', 'sm')}
            >
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="hp-small text-text-muted">Page {page}</span>
          {hasNext ? (
            <Link
              href={`/notifications?page=${page + 1}`}
              className={buttonClass('ghost', 'sm')}
            >
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
