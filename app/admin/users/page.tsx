import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Cell, DataTable, StatusText } from '@/components/admin/data-table';
import { requireAdmin } from '@/lib/auth/guards';
import { listUsers } from '@/services/admin.service';
import type { UserStatus } from '@/types/auth';

export const metadata: Metadata = { title: 'Users · Admin' };

/** /admin/users — PHASE-13 §7, §8. Operational fields only. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;

  const status =
    params.status === 'active' ||
    params.status === 'suspended' ||
    params.status === 'disabled'
      ? (params.status as UserStatus)
      : undefined;

  const users = await listUsers({ search: params.q, status });

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader title="Users" description="Accounts and their operational state." />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-0 flex-1">
          <label htmlFor="q" className="hp-label text-text-muted">
            Search by email or name
          </label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ''}
            className="mt-1 w-full rounded-[var(--radius-hp)] border border-border bg-surface px-3 py-2 text-text"
          />
        </div>
        <div>
          <label htmlFor="status" className="hp-label text-text-muted">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={params.status ?? ''}
            className="mt-1 rounded-[var(--radius-hp)] border border-border bg-surface px-3 py-2 text-text"
          >
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="disabled">Disabled</option>
          </select>
        </div>
        <button
          type="submit"
          className="rounded-[var(--radius-hp)] border border-border-strong px-3 py-2 text-sm font-medium text-text"
        >
          Search
        </button>
      </form>

      <DataTable
        headers={['Email', 'Name', 'Role', 'Status', 'Joined', '']}
        rowCount={users.length}
        empty="No accounts match that search."
      >
        {users.map((user) => (
          <tr key={user.id}>
            <Cell>{user.email ?? '—'}</Cell>
            <Cell>{user.fullName ?? '—'}</Cell>
            <Cell>{user.role}</Cell>
            <Cell>
              <StatusText value={user.status} />
            </Cell>
            <Cell>{new Date(user.createdAt).toLocaleDateString()}</Cell>
            <Cell>
              <Link
                href={`/admin/users/${user.id}`}
                className="text-primary-text underline"
              >
                Open
              </Link>
            </Cell>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
