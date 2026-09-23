import { VoidTransactionForm } from '@/components/finance/void-transaction-form';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Amount } from '@/components/finance/amount';
import { SelectField, TextField } from '@/components/ui/field';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/states';
import { requireUser } from '@/lib/auth/guards';
import {
  transactionFilterSchema,
  type TransactionFilter,
} from '@/schemas/finance.schema';
import { listAccounts } from '@/services/account.service';
import { listTransactions } from '@/services/transaction.service';
import { TRANSACTION_TYPES } from '@/lib/finance/types';
import { buttonClass } from '@/components/ui/button';
import { SuccessNextSteps } from '@/components/ui/success-next-steps';

export const metadata: Metadata = { title: 'Transactions' };

const TYPE_LABELS: Record<string, string> = {
  income: 'Income',
  expense: 'Expense',
  transfer: 'Transfer',
  refund: 'Refund',
  adjustment: 'Adjustment',
  opening_balance: 'Opening balance',
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireUser();
  const raw = await searchParams;

  // Invalid filters fall back to defaults rather than erroring — a bad URL
  // should not be a dead end.
  const parsed = transactionFilterSchema.safeParse(raw);
  const filter = parsed.success ? parsed.data : transactionFilterSchema.parse({});
  const createdType = raw.created === '1' ? raw.type : undefined;
  const createdLabel = createdType ? TYPE_LABELS[createdType] : undefined;
  const hasFilters = Boolean(
    filter.from ||
    filter.to ||
    filter.type ||
    filter.accountId ||
    filter.categoryId ||
    filter.search,
  );

  const [{ transactions, page, hasNext }, accounts] = await Promise.all([
    listTransactions(filter),
    listAccounts({ includeArchived: true }),
  ]);
  const accountName = new Map(accounts.map((a) => [a.id, a.name]));

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Transactions"
        description={
          transactions.length === 1
            ? '1 transaction on this page'
            : `${transactions.length} transactions on this page`
        }
        actions={
          <Link href="/transactions/new" className={buttonClass('primary', 'sm')}>
            Add
          </Link>
        }
      />

      {createdLabel ? (
        <SuccessNextSteps
          title={`${createdLabel} saved`}
          description="Your balances and dashboard have been updated."
          primary={{ href: '/dashboard', label: 'View dashboard' }}
          secondary={[
            {
              href: `/transactions/new?type=${createdType}`,
              label: `Add another ${createdLabel.toLowerCase()}`,
            },
            { href: '/documents', label: 'Upload receipt' },
          ]}
        />
      ) : null}

      {/*
        A set filter floats its own label and takes the jade border, so the row
        says which filters are on without a separate "2 active" counter. The
        `aria-label`s these controls used to carry are gone: a visible <label>
        is the accessible name now, and keeping both would make the two
        disagree (WCAG 2.5.3).
      */}
      <form className="mb-4 flex flex-wrap gap-2" method="get">
        <SelectField
          id="type"
          label="Type"
          defaultValue={filter.type ?? ''}
          size="sm"
          showMessage={false}
          wrapClassName="w-44"
        >
          <option value="">All types</option>
          {TRANSACTION_TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABELS[t]}
            </option>
          ))}
        </SelectField>
        <SelectField
          id="accountId"
          label="Account"
          defaultValue={filter.accountId ?? ''}
          size="sm"
          showMessage={false}
          wrapClassName="w-44"
        >
          <option value="">All accounts</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </SelectField>
        <TextField
          id="search"
          label="Merchant or note"
          type="search"
          defaultValue={filter.search ?? ''}
          size="sm"
          showMessage={false}
          wrapClassName="min-w-0 flex-1"
        />
        <button
          type="submit"
          className="h-11 rounded-[var(--radius-hp)] border border-border-strong px-3 text-sm font-medium text-text"
        >
          Filter
        </button>
      </form>

      {transactions.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No matching transactions' : 'No transactions yet'}
          description={
            hasFilters
              ? 'Try clearing the filters to see your full history.'
              : 'Record an expense, income or transfer to start your history.'
          }
          action={
            <Link
              href={hasFilters ? '/transactions' : '/transactions/new?type=expense'}
              className={buttonClass(hasFilters ? 'ghost' : 'primary', 'md')}
            >
              {hasFilters ? 'Clear filters' : 'Add your first expense'}
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {transactions.map((tx) => {
            const account =
              accountName.get(tx.source_account_id ?? '') ??
              accountName.get(tx.destination_account_id ?? '') ??
              '';
            const voided = tx.status === 'voided';
            return (
              <li key={tx.id}>
                <Card className={voided ? 'opacity-60' : undefined}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-text">
                        {tx.merchant_name ?? tx.description ?? TYPE_LABELS[tx.type]}
                      </p>
                      <p className="hp-small text-text-muted">
                        {tx.transaction_date}
                        {account ? ` · ${account}` : ''} · {TYPE_LABELS[tx.type]}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Voided is stated in words, not only by dimming. */}
                      {voided ? <Badge tone="neutral">Voided</Badge> : null}
                      <Amount
                        value={tx.amount}
                        tone={voided ? 'neutral' : tx.analytics}
                        showSign={!voided && tx.analytics !== 'neutral'}
                      />
                    </div>
                  </div>
                  {!voided && <VoidTransactionForm id={tx.id} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {page > 1 || hasNext ? (
        <nav className="mt-4 flex items-center justify-between" aria-label="Pagination">
          <span className="hp-small text-text-muted">Page {page}</span>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link
                href={pageHref(filter, page - 1)}
                className="rounded-[var(--radius-hp)] border border-border-strong px-3 py-2 text-sm text-text"
              >
                Previous
              </Link>
            ) : null}
            {hasNext ? (
              <Link
                href={pageHref(filter, page + 1)}
                className="rounded-[var(--radius-hp)] border border-border-strong px-3 py-2 text-sm text-text"
              >
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

/**
 * A page link that keeps the active filters.
 *
 * These used to be a bare `?page=N`, which silently dropped the type, account,
 * date range and search on every page change — so page 2 of a filtered list
 * was page 2 of everything. The analytics page links in here with filters
 * attached, which makes that far more visible.
 */
function pageHref(filter: TransactionFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter.from) params.set('from', filter.from);
  if (filter.to) params.set('to', filter.to);
  if (filter.type) params.set('type', filter.type);
  if (filter.accountId) params.set('accountId', filter.accountId);
  if (filter.categoryId) params.set('categoryId', filter.categoryId);
  if (filter.search) params.set('search', filter.search);
  if (filter.sort !== 'newest') params.set('sort', filter.sort);
  if (page > 1) params.set('page', String(page));

  const query = params.toString();
  return query ? `/transactions?${query}` : '/transactions';
}
