import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Cell, DataTable } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listAuditLog } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Audit · Admin' };

/**
 * /admin/audit — PHASE-13 §52 to §55.
 *
 * §55 requires admin actions to carry a reason, and this is the page where
 * that requirement earns its keep: an audit trail of "user_suspended" rows
 * with no reason answers when but never why, which is the question anyone
 * reading it six months later actually has.
 *
 * `audit_logs` is append-only — no UPDATE or DELETE policy exists for any role,
 * including the admin who wrote a row (Phase 01).
 */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string; eventType?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const rows = await listAuditLog(params);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Audit log" description="Append-only. Nobody can edit these." />

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        {[
          ['All', ''],
          ['Admin', 'admin'],
          ['Auth', 'auth'],
          ['Recurring', 'recurring_rule'],
          ['AI', 'ai'],
        ].map(([label, value]) => (
          <Link
            key={label}
            href={value ? `/admin/audit?entityType=${value}` : '/admin/audit'}
            className="hp-small text-primary-text underline"
          >
            {label}
          </Link>
        ))}
      </div>

      <DataTable
        headers={['Event', 'Actor', 'Target', 'Reason', 'When']}
        rowCount={rows.length}
        empty="Nothing recorded yet."
      >
        {rows.map((row) => (
          <tr key={row.id}>
            <Cell>{row.eventType.replace(/_/g, ' ')}</Cell>
            <Cell>{row.actorUserId ? row.actorUserId.slice(0, 8) : 'system'}</Cell>
            <Cell>
              {row.targetUserId ? (
                <Link
                  href={`/admin/users/${row.targetUserId}`}
                  className="text-primary-text underline"
                >
                  {row.targetUserId.slice(0, 8)}
                </Link>
              ) : (
                '—'
              )}
            </Cell>
            <Cell>
              {typeof row.metadata.reason === 'string' ? row.metadata.reason : '—'}
            </Cell>
            <Cell>{new Date(row.createdAt).toLocaleString()}</Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
