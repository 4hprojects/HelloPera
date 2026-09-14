import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardLabel, SectionCard } from '@/components/ui/card';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { getAiOverview } from '@/services/admin.service';

export const metadata: Metadata = { title: 'AI · Admin' };

/**
 * /admin/ai — PHASE-13 §28, §29, §30.
 *
 * §28: *"Do not show private question text by default."* As with OCR, there is
 * no "by default" here — `ai_usage_logs` has no column holding a question, so
 * this page could not show one if it tried. That was a Phase 12 schema
 * decision (§94), and this page is where it pays off.
 */
export default async function AdminAiPage() {
  await requireAdmin();

  const configured = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
  const ai = await getAiOverview(configured);

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="AI operations"
        description="Provider health over the last 7 days. Questions are never shown."
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardLabel>Health</CardLabel>
          <p className="mt-1.5">
            <StatusText value={ai.health} />
          </p>
        </Card>
        <Card>
          <CardLabel>Calls</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">{ai.total}</p>
        </Card>
        <Card>
          <CardLabel>Failed</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">{ai.failed}</p>
        </Card>
        <Card>
          <CardLabel>Median time</CardLabel>
          <p className="hp-amount hp-amount-lg mt-1.5 text-text">
            {ai.medianDurationMs === null ? '—' : `${ai.medianDurationMs}ms`}
          </p>
        </Card>
      </div>

      {!configured ? (
        <p className="hp-small mb-4 text-text-muted">
          No AI provider is configured, so there is nothing to report. Set{' '}
          <code>ANTHROPIC_API_KEY</code> to switch the assistant and OCR on.
        </p>
      ) : null}

      <SectionCard title="Questions by intent" className="mb-4">
        {ai.byIntent.length === 0 ? (
          <p className="hp-small text-text-muted">Nothing yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {ai.byIntent.slice(0, 12).map((row) => (
              <li key={row.value} className="flex justify-between gap-3 py-2">
                <span className="hp-small text-text-muted">{row.value}</span>
                <span className="hp-small tabular-nums text-text">{row.count}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <h2 className="hp-h3 mb-2 text-text">Recent failures</h2>
      <DataTable
        headers={['User', 'Intent', 'Model', 'Error', 'Duration', 'When']}
        rowCount={ai.recentFailures.length}
        empty="No failures in the last 7 days."
      >
        {ai.recentFailures.map((row) => (
          <tr key={row.id}>
            <Cell>
              <Link
                href={`/admin/users/${row.userId}`}
                className="text-primary-text underline"
              >
                {row.userId.slice(0, 8)}
              </Link>
            </Cell>
            <Cell>{row.intent ?? '—'}</Cell>
            <Cell>{row.model}</Cell>
            <Cell>{row.errorCode ?? '—'}</Cell>
            <Cell numeric>{row.durationMs}ms</Cell>
            <Cell>{new Date(row.createdAt).toLocaleString()}</Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
