import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card, SectionCard } from '@/components/ui/card';
import { Cell, DataTable } from '@/components/admin/data-table';
import { AdminForm } from '@/components/admin/admin-form';
import { requireAdmin } from '@/lib/auth/guards';
import { listIntegrityFindings, listJobRuns } from '@/services/admin.service';
import { repairBalanceAction, runIntegrityCheckAction } from '@/app/actions/admin';

export const metadata: Metadata = { title: 'Integrity · Admin' };

/**
 * /admin/integrity — PHASE-14 §64, §65, §66.
 *
 * The screen exists because §65 changed what the check is for. Until Phase 14,
 * `check_balance_integrity` repaired as it read, so there was nothing to show:
 * by the time you looked, it was fixed. Now the check reports and leaves the
 * drift in place, which means someone has to see it and decide — and that is
 * the entire argument for detection being separate from repair.
 *
 * Repair is per-account, never bulk. A button that fixes everything is a button
 * that hides how much was wrong.
 */
export default async function AdminIntegrityPage() {
  await requireAdmin();

  const [findings, runs] = await Promise.all([listIntegrityFindings(), listJobRuns(5)]);

  const lastRun = runs.find((r) => r.jobType === 'financial_integrity_check');
  const balanceFindings = findings.filter((f) => f.checkName === 'account_balance');
  const others = findings.filter((f) => f.checkName !== 'account_balance');

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Financial integrity"
        description="Mismatches between what is stored and what the records imply."
      />

      <Card className="mb-4">
        <p className="hp-body text-text">
          {findings.length === 0
            ? 'No mismatches. Every cached figure agrees with the records behind it.'
            : `${findings.length} mismatch${findings.length === 1 ? '' : 'es'} found.`}
        </p>
        <p className="hp-small mt-1 text-text-muted">
          {lastRun
            ? `The nightly check last ran ${new Date(lastRun.startedAt).toLocaleString()} (${lastRun.status}).`
            : 'The nightly check has not run yet.'}
        </p>
        <div className="mt-3">
          <AdminForm
            action={runIntegrityCheckAction}
            submitLabel="Run the check now"
            reasonLabel="Why are you running it?"
          />
        </div>
      </Card>

      {balanceFindings.length > 0 ? (
        <SectionCard title="Account balances" className="mb-4">
          {/*
            §66 — one account at a time. Bulk repair would clear the board
            without anyone seeing the shape of the problem, and the shape is
            the diagnostic: one account drifting is a data issue, every account
            drifting is a bug in the balance engine.
          */}
          <ul className="divide-y divide-border">
            {balanceFindings.map((f) => (
              <li key={f.entityId} className="py-3">
                <p className="hp-body text-text">{f.detail}</p>
                <p className="hp-small text-text-muted">
                  Stored <span className="tabular-nums">{f.actual}</span> · records imply{' '}
                  <span className="tabular-nums">{f.expected}</span>
                </p>
                <div className="mt-2">
                  <AdminForm
                    action={repairBalanceAction}
                    hidden={{ accountId: f.entityId, userId: f.userId ?? '' }}
                    submitLabel="Recalculate this account"
                    destructive
                  />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      <h2 className="hp-h3 mb-2 text-text">Everything else</h2>
      <DataTable
        headers={['Check', 'Entity', 'Detail', 'Expected', 'Actual', 'User']}
        rowCount={others.length}
        empty="No other mismatches."
      >
        {others.map((f) => (
          <tr key={`${f.checkName}-${f.entityId}`}>
            <Cell>{f.checkName.replace(/_/g, ' ')}</Cell>
            <Cell>{f.entityType}</Cell>
            <Cell>{f.detail}</Cell>
            <Cell numeric>{f.expected ?? '—'}</Cell>
            <Cell numeric>{f.actual ?? '—'}</Cell>
            <Cell>
              {f.userId ? (
                <Link
                  href={`/admin/users/${f.userId}`}
                  className="text-primary-text underline"
                >
                  {f.userId.slice(0, 8)}
                </Link>
              ) : (
                '—'
              )}
            </Cell>
          </tr>
        ))}
      </DataTable>

      {/*
        §65 — the one thing this page must not offer. Repairing everything
        found, in one click, is how a systemic bug gets quietly normalised.
      */}
      <p className="hp-small mt-4 text-text-muted">
        There is no bulk repair, deliberately. One account drifting is a data problem;
        many accounts drifting is a bug worth finding before it is erased.
      </p>
    </div>
  );
}
