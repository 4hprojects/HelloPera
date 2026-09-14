import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listContent } from '@/services/admin.service';

export const metadata: Metadata = { title: 'Content · Admin' };

/**
 * /admin/content — PHASE-13 §37, §38.
 *
 * Read-only, and that is a decision rather than an omission.
 *
 * Phase 10 shipped guides as files under `content/guides/` with a
 * draft/published status and a registry that already distinguishes "everything"
 * from "what the public site may serve". Adding a database-backed editor would
 * create a second content system: two places a guide can live, two sources of
 * truth for whether it is published, and a new way for the sitemap and the page
 * to disagree.
 *
 * Editing a guide is therefore a commit — which brings version history, review
 * and rollback for free, none of which a CMS field would. What an operator
 * actually needs from a screen is the answer to "what is live right now, and is
 * anything stuck in draft", and that is what this shows.
 */
export default async function AdminContentPage() {
  await requireAdmin();
  const rows = listContent();

  const drafts = rows.filter((r) => !r.live).length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Content"
        description="Guides in the repository. Editing one is a commit, not a form."
      />

      <p className="hp-small mb-4 text-text-muted">
        {rows.length} guide{rows.length === 1 ? '' : 's'}, {drafts} in draft. Drafts are
        excluded from the public site and the sitemap.
      </p>

      <DataTable
        headers={['Title', 'Slug', 'Category', 'Status', 'Updated', '']}
        rowCount={rows.length}
        empty="No guides found in content/guides/."
      >
        {rows.map((row) => (
          <tr key={row.slug}>
            <Cell>{row.title}</Cell>
            <Cell>{row.slug}</Cell>
            <Cell>{row.category}</Cell>
            <Cell>
              <StatusText value={row.status} />
            </Cell>
            <Cell>{row.updatedAt ?? '—'}</Cell>
            <Cell>
              {row.live ? (
                <Link
                  href={`/guides/${row.slug}`}
                  className="text-primary-text underline"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View
                </Link>
              ) : (
                '—'
              )}
            </Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
