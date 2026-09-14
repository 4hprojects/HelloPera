import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listOcrJobs } from '@/services/admin.service';

export const metadata: Metadata = { title: 'OCR jobs · Admin' };

/**
 * /admin/ocr-jobs — PHASE-13 §24, §26, §27.
 *
 * §24: *"Do not show raw OCR text in list view."* Nothing on this page can:
 * the text lives in `ocr_results`, and `services/admin.service.ts` never reads
 * that table at all — asserted by `services/admin.privacy.test.ts` rather than
 * promised in a comment.
 *
 * §26 offers an escalation mechanism for inspecting document content. This
 * build deliberately has none. A half-finished escalation path — one without
 * time limits, or one whose audit trail nobody reads — is worse than requiring
 * a deliberate trip to the database, which is itself the "explicit and
 * non-routine" property §26 is asking for.
 */
export default async function AdminOcrJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAdmin();
  const { status } = await searchParams;
  const jobs = await listOcrJobs({ status });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="OCR jobs"
        description="Processing state. Document contents are never shown here."
      />

      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1">
        {[
          ['All', ''],
          ['Failed', 'failed'],
          ['Processing', 'processing'],
          ['Completed', 'completed'],
        ].map(([label, value]) => (
          <Link
            key={label}
            href={value ? `/admin/ocr-jobs?status=${value}` : '/admin/ocr-jobs'}
            className="hp-small text-primary-text underline"
          >
            {label}
          </Link>
        ))}
      </div>

      <DataTable
        headers={['Job', 'User', 'Provider', 'Status', 'Attempts', 'Error', 'Created']}
        rowCount={jobs.length}
        empty="No jobs match."
      >
        {jobs.map((job) => (
          <tr key={job.id}>
            <Cell>{job.id.slice(0, 8)}</Cell>
            <Cell>
              <Link
                href={`/admin/users/${job.userId}`}
                className="text-primary-text underline"
              >
                {job.userId.slice(0, 8)}
              </Link>
            </Cell>
            <Cell>{job.provider ?? '—'}</Cell>
            <Cell>
              <StatusText value={job.status} />
            </Cell>
            <Cell numeric>{job.attemptCount}</Cell>
            <Cell>{job.errorCode ?? '—'}</Cell>
            <Cell>{new Date(job.createdAt).toLocaleString()}</Cell>
          </tr>
        ))}
      </DataTable>

      {/* §27 — retry is code, but it cannot run without a provider key. Saying
          so beats a button that fails. */}
      <p className="hp-small mt-4 text-text-muted">
        Retrying a failed job needs <code>ANTHROPIC_API_KEY</code> to be set. See the
        launch checklist.
      </p>
    </div>
  );
}
