import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel } from '@/components/ui/card';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listJobRuns } from '@/services/admin.service';

export const metadata: Metadata = { title: 'System · Admin' };

/**
 * /admin/system — PHASE-13 §39 to §51.
 *
 * §48 to §51 are the substance: scheduled job health, visible. §51 is explicit
 * that Phase 13 adds no new overlap mechanism — `job_runs` and the advisory
 * lock in `begin_job` have done that since Phase 07, and this page reports what
 * they already record.
 *
 * Provider health for OCR, AI and billing is reported as "not configured"
 * rather than invented. A green light for something that cannot run is worse
 * than no light, because it gets believed.
 */
export default async function AdminSystemPage() {
  await requireAdmin();
  const runs = await listJobRuns();

  const providers = [
    ['Database', true, 'Supabase Postgres'],
    ['Storage', true, 'Supabase Storage'],
    [
      'OCR and AI',
      Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN),
      'ANTHROPIC_API_KEY',
    ],
    ['Push', Boolean(process.env.VAPID_PRIVATE_KEY), 'VAPID keys'],
    ['Scheduler', Boolean(process.env.SCHEDULER_SECRET), 'SCHEDULER_SECRET'],
    ['Billing', false, 'No provider adapter yet'],
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="System" description="Providers and scheduled jobs." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {providers.map(([name, configured, hint]) => (
          <Card key={name}>
            <CardLabel>{name}</CardLabel>
            <p className="mt-1.5">
              <StatusText value={configured ? 'operational' : 'not configured'} />
            </p>
            <p className="hp-small mt-1 text-text-muted">{hint}</p>
          </Card>
        ))}
      </div>

      <h2 className="hp-h3 mb-2 text-text">Recent job runs</h2>
      <DataTable
        headers={['Job', 'Status', 'Started', 'Duration', 'Error']}
        rowCount={runs.length}
        empty="No jobs have run. pg_cron may not be scheduled yet."
      >
        {runs.map((run) => (
          <tr key={run.id}>
            <Cell>{run.jobType}</Cell>
            <Cell>
              <StatusText value={run.status} />
            </Cell>
            <Cell>{new Date(run.startedAt).toLocaleString()}</Cell>
            <Cell numeric>{run.durationMs === null ? '—' : `${run.durationMs}ms`}</Cell>
            <Cell>{run.errorCode ?? '—'}</Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
