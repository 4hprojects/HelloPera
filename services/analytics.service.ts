import 'server-only';

import { createClient } from '@/lib/supabase/server';
import {
  bucketByMonth,
  incomeByCategory,
  spendingByAccount,
  spendingByCategory,
  spendingByMerchant,
  summariseCashFlow,
  type AnalyticsRow,
  type CategoryAggregate,
} from '@/lib/analytics/aggregate';
import {
  applyFilter,
  isNeutralType,
  visibleBreakdowns,
  type AnalyticsFilter,
} from '@/lib/analytics/filter';
import { MAX_RANGE_YEARS, monthsInRange, rangeFor } from '@/lib/analytics/range';
import { todayInTimezone } from '@/lib/finance/obligation';
import { fromDatabase } from '@/lib/money';
import type { Direction, TransactionStatus, TransactionType } from '@/lib/finance/types';
import { listAccounts } from '@/services/account.service';
import { listCategories } from '@/services/category.service';
import type { AnalyticsParams } from '@/schemas/analytics.schema';
import type { AnalyticsData, RejectedFilter } from '@/types/analytics';
import type { LabelledAggregate } from '@/types/dashboard';

/**
 * Fetching for the analytics layer — PHASE-06 §30.
 *
 * This module does I/O and nothing else. Every figure is computed by the pure
 * functions in `lib/analytics/`, which is what makes §34's accuracy property
 * testable at all: `services/*` imports `server-only`, whose entry point
 * throws on import, so nothing under it can be reached from a unit test.
 *
 * Aggregation happens in this process rather than in SQL. §32 says not to
 * create views prematurely and §33 rules out materialized views for MVP,
 * while §66's actual concern is the browser summing rows — it never sees one.
 * The trade is deliberate and has a tripwire: at the §69 target of "several
 * thousand transactions per user" a year of rows is a few hundred KB of JSON
 * and single-digit milliseconds to reduce. Past roughly 20k rows in a window,
 * move `fetchAnalyticsRows` to a `SECURITY DEFINER` RPC that returns
 * pre-grouped totals — the pure layer above it takes plain rows, so nothing
 * else has to change.
 */

/** PostgREST refuses more than this per request regardless of what we ask for. */
const PAGE = 1000;
/** Refuse to spin forever if `count` and the row stream ever disagree. */
const MAX_PAGES = 60;

export type AnalyticsWindow = {
  /** YYYY-MM-DD inclusive, already in the user's timezone (§35). */
  from: string;
  to: string;
  // Pass 2 adds accountId / categoryId / type / currency here (§26–§29); the
  // shape is the reason this is a separate module from dashboard.service.
};

type Row = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  direction: Direction | null;
  amount: string;
  currency_code: string;
  transaction_date: string;
  category_id: string | null;
  source_account_id: string | null;
  destination_account_id: string | null;
  merchant_name: string | null;
  refund_of_transaction_id: string | null;
  /**
   * The original purchase, resolved in the same round-trip. §14 attributes a
   * refund to the category and account of what it reverses — which may sit
   * outside the fetched window entirely, so it cannot be recovered from the
   * rows we already have.
   */
  parent: {
    category_id: string | null;
    source_account_id: string | null;
    merchant_name: string | null;
    currency_code: string;
  } | null;
};

const SELECT = `
  id, type, status, direction, amount, currency_code, transaction_date,
  category_id, source_account_id, destination_account_id, merchant_name,
  refund_of_transaction_id,
  parent:refund_of_transaction_id (
    category_id, source_account_id, merchant_name, currency_code
  )
`;

/**
 * Every confirmed transaction in the window, as rows the pure aggregators
 * understand.
 *
 * **Paginated, and that is not an optimisation.** Supabase caps a REST read
 * at 1000 rows and returns HTTP 200 with `content-range: 0-999/2500` — no
 * error, just silently fewer rows. An unbounded select here would under-report
 * every total on the dashboard for any user past a thousand transactions, and
 * nothing would look wrong. Verified against this project: the cap is live.
 *
 * No `user_id` predicate anywhere (§60): the session client carries the user's
 * JWT and RLS scopes the read. There is no parameter through which a browser
 * could ask for someone else's rows, and the embedded parent is filtered by
 * the same policy, so a refund cannot borrow another user's category.
 */
export async function fetchAnalyticsRows(
  window: AnalyticsWindow,
): Promise<AnalyticsRow[]> {
  const supabase = await createClient();
  const rows: Row[] = [];
  let expected: number | null = null;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const offset = page * PAGE;
    const { data, error, count } = await supabase
      .from('transactions')
      .select(SELECT, { count: page === 0 ? 'exact' : undefined })
      .eq('status', 'confirmed')
      .gte('transaction_date', window.from)
      .lte('transaction_date', window.to)
      // A stable order is what makes paging safe: without it two pages can
      // overlap or skip rows.
      .order('transaction_date', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + PAGE - 1)
      .returns<Row[]>();

    if (error) throw new Error(`Could not load analytics rows: ${error.code}`);
    const batch = data ?? [];
    rows.push(...batch);

    if (page === 0) expected = count ?? batch.length;
    if (batch.length < PAGE) break;
    if (expected !== null && rows.length >= expected) break;
  }

  // Loud rather than quietly wrong: a short read means every total below it
  // is understated, which is the one failure mode a finance dashboard must
  // not have.
  if (expected !== null && rows.length < expected) {
    throw new Error(
      `Analytics read incomplete: got ${rows.length} of ${expected} rows. ` +
        'Totals would be understated, so nothing is shown.',
    );
  }

  return rows.map(toAnalyticsRow);
}

function toAnalyticsRow(row: Row): AnalyticsRow {
  const currency = row.currency_code;
  // §8 — never attribute across currencies. A parent in another currency is
  // treated as if it were not linked at all.
  const parent = row.parent && row.parent.currency_code === currency ? row.parent : null;

  return {
    type: row.type,
    status: row.status,
    direction: row.direction,
    minor: fromDatabase(row.amount, currency).minor,
    currency,
    date: row.transaction_date,
    categoryId: row.category_id,
    // An expense leaves the source account; a refund arrives at the
    // destination. `attribution` below is what decides which one a breakdown
    // uses, so both are carried.
    sourceAccountId: row.source_account_id ?? row.destination_account_id,
    merchant: normaliseBlank(row.merchant_name),
    refundOf: parent
      ? {
          categoryId: parent.category_id,
          sourceAccountId: parent.source_account_id,
          merchant: normaliseBlank(parent.merchant_name),
        }
      : null,
  };
}

/** Trim, and treat an empty string as absent — they mean the same thing. */
function normaliseBlank(value: string | null): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Category names for the ids a breakdown produced. One query, never per-row. */
export async function resolveCategoryNames(
  ids: ReadonlyArray<string | null>,
): Promise<Map<string, string>> {
  const real = [...new Set(ids.filter((id): id is string => id !== null))];
  if (real.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id, name')
    .in('id', real)
    .returns<Array<{ id: string; name: string }>>();

  if (error) throw new Error(`Could not load category names: ${error.code}`);
  return new Map((data ?? []).map((c) => [c.id, c.name]));
}

/**
 * Everything the /analytics page renders — PHASE-06 §30, §52.
 *
 * Three reads, all in parallel: accounts (for the §26 selector, the currency
 * list and account names), categories (§27 selector and names) and the rows
 * themselves. Category and account names come from the selector lists that
 * are loaded anyway, so no second wave is needed.
 *
 * Only the date range reaches SQL. Account, category and type are applied in
 * memory by `applyFilter` — narrowing the query would drop the refund rows
 * that §14 nets against their original purchase, and every breakdown would
 * come out overstated. `lib/analytics/filter.ts` explains it at length.
 */
export async function getAnalyticsData({
  timezone,
  preferredCurrency,
  params,
}: {
  timezone: string;
  preferredCurrency: string;
  params: AnalyticsParams & { dropped?: string[] };
}): Promise<AnalyticsData> {
  const today = todayInTimezone(timezone);
  const range = rangeFor(params.range, today, { from: params.from, to: params.to });

  const [accounts, categories, rows] = await Promise.all([
    listAccounts({ includeArchived: true }),
    listCategories(),
    fetchAnalyticsRows({ from: range.from, to: range.to }),
  ]);

  const rejected: RejectedFilter[] = [];

  // A parameter that was supplied but unparseable — a truncated id in a
  // pasted link, say. Silently ignoring it looks like the filter is broken.
  for (const key of params.dropped ?? []) {
    rejected.push({
      field:
        key === 'currency'
          ? 'currency'
          : key === 'accountId'
            ? 'account'
            : key === 'categoryId'
              ? 'category'
              : 'range',
      reason: `The "${key}" value in the link was not readable, so it was ignored.`,
    });
  }
  if (range.swapped) {
    rejected.push({
      field: 'range',
      reason: 'The dates were the wrong way round, so they have been swapped.',
    });
  }
  if (range.clamped) {
    rejected.push({
      field: 'range',
      reason: `Ranges are limited to ${MAX_RANGE_YEARS} years, so the start date was moved forward.`,
    });
  }

  // §65 — a UUID being well-formed says nothing about whose it is. RLS would
  // return no rows for someone else's account, which reads identically to "no
  // activity"; resolving against the user's own list refuses it out loud.
  const accountById = new Map(accounts.map((a) => [a.id, a]));
  let accountId = params.accountId;
  if (accountId && !accountById.has(accountId)) {
    rejected.push({ field: 'account', reason: 'That account is not one of yours.' });
    accountId = undefined;
  }

  const categoryById = new Map(categories.map((c) => [c.id, c]));
  let categoryId = params.categoryId;
  if (categoryId && !categoryById.has(categoryId)) {
    rejected.push({ field: 'category', reason: 'That category no longer exists.' });
    categoryId = undefined;
  }

  // §29 — a currency the user holds nothing in would produce a page of real
  // zeroes, which is worse than no page at all.
  const held = [...new Set(accounts.map((a) => a.currency_code))].sort((a, b) =>
    a === preferredCurrency ? -1 : b === preferredCurrency ? 1 : a.localeCompare(b),
  );
  const currencies = held.length > 0 ? held : [preferredCurrency];
  let currency = params.currency ?? currencies[0]!;
  if (!currencies.includes(currency)) {
    rejected.push({
      field: 'currency',
      reason: `You have no accounts in ${currency}.`,
    });
    currency = currencies[0]!;
  }

  const filter: AnalyticsFilter = { accountId, categoryId, type: params.type };
  const filtered = applyFilter(rows, filter);
  const { months, truncated } = monthsInRange(range);
  if (truncated) {
    rejected.push({
      field: 'range',
      reason: `The trend shows the most recent ${months.length} months of this range.`,
    });
  }
  const show = visibleBreakdowns(filter);

  const usedCategoryIds = new Set(filtered.map((r) => r.categoryId));
  for (const r of filtered)
    if (r.refundOf?.categoryId) usedCategoryIds.add(r.refundOf.categoryId);
  // `listCategories()` only returns active rows, so a category the user
  // deactivated would fall back to "Uncategorised" and silently merge with
  // the genuinely uncategorised — §73 requires its history stay visible.
  const historicNames = await resolveCategoryNames([...usedCategoryIds]);
  const nameOfCategory = (id: string | null) =>
    id
      ? (historicNames.get(id) ?? categoryById.get(id)?.name ?? 'Removed category')
      : 'Uncategorised';
  const nameOfAccount = (id: string | null) =>
    id ? (accountById.get(id)?.name ?? 'Closed account') : 'No account';

  return {
    range,
    currency,
    currencies,
    filter,
    rejected,
    cashFlow: summariseCashFlow(filtered, currency),
    months,
    trend: bucketByMonth(filtered, months, currency),
    spendingByCategory: show.byCategory
      ? withLabels(spendingByCategory(filtered, currency), nameOfCategory)
      : [],
    spendingByAccount: show.byAccount
      ? withLabels(spendingByAccount(filtered, currency), nameOfAccount)
      : [],
    spendingByMerchant: show.byMerchant
      ? withLabels(spendingByMerchant(filtered, currency), (m) => m ?? 'Not recorded')
      : [],
    incomeByCategory: show.income
      ? withLabels(incomeByCategory(filtered, currency), nameOfCategory)
      : [],
    show,
    isNeutralType: isNeutralType(params.type),
    accountOptions: accounts
      // §26 — archived accounts are out of the picker by default; their
      // historical rows still resolve a name through `accountById`.
      .filter((a) => !a.is_archived)
      .map((a) => ({ id: a.id, label: a.name, hint: a.currency_code })),
    categoryOptions: categories.map((c) => ({ id: c.id, label: c.name })),
    hasNoData: accounts.length === 0,
  };
}

function withLabels(
  aggregates: readonly CategoryAggregate[],
  nameOf: (id: string | null) => string,
): LabelledAggregate[] {
  return aggregates.map((a) => ({ ...a, label: nameOf(a.categoryId) }));
}
