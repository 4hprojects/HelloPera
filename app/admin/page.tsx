import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, CardLabel } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { requireAdmin } from '@/lib/auth/guards';
import { getAdminOverview } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Admin' };

/**
 * /admin — PHASE-13 §6.
 *
 * Operational counts only. §4's boundary holds here as everywhere: how many
 * documents failed to process is an operational fact; what any of them said is
 * not, and nothing on this page can reach it.
 */
export default async function AdminPage() {
  await requireAdmin();
  const overview = await getAdminOverview();

  const cards: Array<{ label: string; value: string; hint?: string; href?: string }> = [
    {
      label: 'Users',
      value: String(overview.users.total),
      hint: `${overview.users.active} active`,
      href: '/admin/users',
    },
    {
      label: 'Suspended',
      value: String(overview.users.suspended + overview.users.disabled),
      hint: `${overview.admins} admin${overview.admins === 1 ? '' : 's'}`,
      href: '/admin/users?status=suspended',
    },
    {
      label: 'OCR (24h)',
      value: String(overview.ocr.today),
      hint: `${overview.ocr.failed} failed`,
      href: '/admin/ocr-jobs',
    },
    {
      label: 'AI (24h)',
      value: String(overview.ai.today),
      hint: `${overview.ai.failed} failed`,
      href: '/admin/ai',
    },
    {
      label: 'Notifications',
      value: String(overview.notifications.pending),
      hint: `${overview.notifications.failed} failed`,
      href: '/admin/notifications',
    },
    {
      label: 'Jobs',
      value:
        overview.jobs.failedRecently > 0
          ? `${overview.jobs.failedRecently} failed`
          : 'OK',
      hint: overview.jobs.lastRunAt
        ? `last ${new Date(overview.jobs.lastRunAt).toLocaleString()}`
        : 'never run',
      href: '/admin/system',
    },
  ];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="HelloPera Admin"
        description="Operational state. No user financial records are shown here, by design."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href ?? '/admin'} className="rounded">
            <Card className="h-full hover:border-border-strong">
              <CardLabel>{card.label}</CardLabel>
              <p className="hp-amount hp-amount-lg mt-1.5 text-text">{card.value}</p>
              {card.hint ? (
                <p className="hp-small mt-1 text-text-muted">{card.hint}</p>
              ) : null}
            </Card>
          </Link>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1">
        {[
          ['Subscriptions', '/admin/subscriptions'],
          ['Usage', '/admin/usage'],
          ['Feature flags', '/admin/feature-flags'],
          ['Audit log', '/admin/audit'],
          ['Content', '/admin/content'],
        ].map(([label, href]) => (
          <Link key={href} href={href!} className="hp-small text-primary-text underline">
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
