import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel } from '@/components/ui/card';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { getBillingProvider } from '@/lib/billing/provider';
import { isPushConfigured } from '@/lib/env';
import { listJobRuns } from '@/services/admin.service';
import { getSystemHealth } from '@/services/system-health.service';

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
  const [runs, health] = await Promise.all([listJobRuns(), getSystemHealth()]);
  const billing = getBillingProvider();

  const providers = [
    ...health,
    {
      key: 'push',
      label: 'Push',
      status: isPushConfigured() ? 'operational' : 'not_configured',
      detail: isPushConfigured() ? 'VAPID keys are configured' : 'VAPID keys are missing',
      durationMs: null,
    },
    {
      key: 'billing',
      label: 'Billing',
      status: billing.isLive ? 'operational' : 'not_configured',
      detail: billing.isLive ? billing.name : 'No provider adapter configured',
      durationMs: null,
    },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="System" description="Providers and scheduled jobs." />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        {providers.map((provider) => (
          <Card key={provider.key}>
            <CardLabel>{provider.label}</CardLabel>
            <p className="mt-1.5">
              <StatusText value={provider.status} />
            </p>
            <p className="hp-small mt-1 text-text-muted">
              {provider.detail}
              {provider.durationMs === null ? '' : `, ${provider.durationMs}ms`}
            </p>
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
