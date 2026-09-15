import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { SelectField, TextField } from '@/components/ui/field';
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
        <TextField
          id="q"
          label="Search by email or name"
          defaultValue={params.q ?? ''}
          size="sm"
          showMessage={false}
          wrapClassName="min-w-0 flex-1"
        />
        <SelectField
          id="status"
          label="Status"
          defaultValue={params.status ?? ''}
          size="sm"
          showMessage={false}
          wrapClassName="w-40"
        >
          <option value="">Any</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="disabled">Disabled</option>
        </SelectField>
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
