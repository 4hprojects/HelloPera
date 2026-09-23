import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { DeleteAccountForm } from './delete-account-form';
import { requireUser } from '@/lib/auth/guards';
import { getDeletionSummary } from '@/services/account-deletion.service';

export const metadata: Metadata = { title: 'Delete account' };

/**
 * /settings/delete — PHASE-14 §69, §70, §71.
 *
 * The workflow's "explain consequences" step is a count, not a paragraph.
 * Telling someone they will lose "your data" is vague enough to be ignored;
 * telling them they will lose 412 transactions is not.
 */
export default async function DeleteAccountPage() {
  const { user } = await requireUser();
  const summary = await getDeletionSummary();

  const lines: Array<[number, string, string]> = [
    [summary.accounts, 'account', 'accounts'],
    [summary.transactions, 'transaction', 'transactions'],
    [
      summary.obligations,
      'bill, receivable or expected income',
      'bills, receivables and expected income',
    ],
    [summary.documents, 'document', 'documents'],
  ];

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Delete account"
        description="This removes your HelloPera account and everything in it."
        actions={
          <Link href="/settings" className={buttonClass('ghost', 'sm')}>
            Back
          </Link>
        }
      />

      <Card className="mb-4">
        <h2 className="hp-h3 text-text">What will be deleted</h2>
        <ul className="mt-3 divide-y divide-border">
          {lines.map(([count, singular, plural]) => (
            <li key={plural} className="flex justify-between gap-3 py-2.5">
              <span className="hp-body text-text-muted">
                {count === 1 ? singular : plural}
              </span>
              <span className="hp-body font-semibold text-text">{count}</span>
            </li>
          ))}
        </ul>

        <p className="hp-body mt-4 text-text-muted">
          Your uploaded files are deleted from storage as part of deletion. If
          interrupted, retry to complete deletion. This cannot be undone, and HelloPera
          keeps no copy you can ask for later.
        </p>

        {/*
          §72 — say plainly what survives. A privacy policy claiming total
          erasure while an audit row remains would be inaccurate, and Phase 10
          §45 requires the policy to describe what actually happens.
        */}
        <p className="hp-small mt-3 text-text-muted">
          We keep one dated record that an account was deleted, with no financial
          information attached. It exists so we can answer questions about deletions and
          nothing else.
        </p>
      </Card>

      <Card className="mb-4">
        <h2 className="hp-h3 mb-1 text-text">Before you go</h2>
        <p className="hp-body text-text-muted">
          You can download everything first — accounts, transactions, bills, receivables
          and expected income.
        </p>
        <Link
          href="/settings/data"
          className={`${buttonClass('secondary', 'sm')} mt-3 inline-flex`}
        >
          Export my data
        </Link>
      </Card>

      <Card>
        <h2 className="hp-h3 mb-3 text-text">Confirm</h2>
        <DeleteAccountForm google={user.app_metadata?.provider === 'google'} />
      </Card>
    </div>
  );
}
