import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Card } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { requireUser } from '@/lib/auth/guards';

export const metadata: Metadata = { title: 'Your data' };

/**
 * /settings/data — PHASE-14 §67, §68.
 *
 * Plain links rather than a form: the route handler returns a file, and a
 * link is what a browser already knows how to save.
 */
export default async function DataPage() {
  await requireUser();

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Your data"
        description="Download everything HelloPera holds for you."
        actions={
          <Link href="/settings" className={buttonClass('ghost', 'sm')}>
            Back
          </Link>
        }
      />

      <Card className="mb-4">
        <h2 className="hp-h3 text-text">Download</h2>
        <p className="hp-body mt-1 text-text-muted">
          Accounts, categories, transactions, bills, receivables, expected income,
          recurring rules and document details.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <a href="/api/export?format=csv" className={buttonClass('primary', 'sm')}>
            Download CSV
          </a>
          <a href="/api/export?format=json" className={buttonClass('secondary', 'sm')}>
            Download JSON
          </a>
        </div>

        <p className="hp-small mt-4 text-text-muted">
          CSV opens in any spreadsheet, with one section per record type. JSON keeps the
          structure and the links between records, which is the better choice if you are
          moving to another tool.
        </p>
      </Card>

      <Card>
        <h2 className="hp-h3 text-text">What is not included</h2>
        <p className="hp-body mt-1 text-text-muted">
          Your uploaded files are not in the export — it lists their details, not the
          images or PDFs themselves. Download those from the Documents screen while your
          account is still open.
        </p>
        <Link
          href="/documents"
          className={`${buttonClass('ghost', 'sm')} mt-3 inline-flex`}
        >
          Go to documents
        </Link>
      </Card>
    </div>
  );
}
