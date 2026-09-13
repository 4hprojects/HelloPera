import { analyticsClass } from '@/lib/finance/balance';
import type { Direction, TransactionStatus, TransactionType } from '@/lib/finance/types';
import { money, zero, type Money } from '@/lib/money';
import { monthLabel } from '@/lib/analytics/series';

/**
 * The Phase 06 aggregation rules, as pure functions.
 *
 * Everything here takes plain rows and returns figures. No I/O, no Supabase,
 * no `server-only` — which is the point: these are the calculations a finance
 * app must not get wrong, and a calculation that cannot be unit-tested will
 * eventually be wrong without anyone noticing. `services/analytics.service.ts`
 * does the fetching and delegates here.
 *
 * The rules, from PHASE-06:
 *
 *   §4   Only confirmed, non-voided rows count.
 *   §11  Income is `type = income`. Transfers, refunds, adjustments and
 *        opening balances are excluded.
 *   §12  Expenses are `type = expense`. Transfers and adjustments excluded;
 *        refunds are NOT excluded — see §14.
 *   §13  Net cash flow = income − net expenses.
 *   §14  Refunds are excluded from income, netted within expenses, and both
 *        gross and net are shown. A refund is attributed to the category and
 *        account of the ORIGINAL purchase, via `refund_of_transaction_id`.
 *   §35  Month boundaries come from the caller's already-localised dates.
 */

/** One transaction, normalised. `minor` is always positive (Phase 02 §73). */
export type AnalyticsRow = {
  type: TransactionType;
  status: TransactionStatus;
  /** §15 — which way an adjustment moved the balance. Null for every other type. */
  direction: Direction | null;
  minor: bigint;
  currency: string;
  /** YYYY-MM-DD, already in the user's timezone. */
  date: string;
  categoryId: string | null;
  sourceAccountId: string | null;
  /** §55 — as typed by the user. Never normalised. */
  merchant: string | null;
  /**
   * The original purchase this row refunds, when there is one. Null for a
   * standalone refund, and for every non-refund row.
   */
  refundOf: {
    categoryId: string | null;
    sourceAccountId: string | null;
    merchant: string | null;
  } | null;
};

export type CashFlowSummary = {
  income: Money;
  /** Expenses before refunds are applied — §14 keeps this visible. */
  grossExpenses: Money;
  refunds: Money;
  /**
   * grossExpenses − refunds. **Signed, never floored.** A period whose
   * refunds exceed its purchases had money come back, and saying "₱0 spent"
   * would both hide that and break the identity the §34 tests assert:
   * `Σ spendingByCategory === netExpenses`.
   */
  netExpenses: Money;
  /** income − netExpenses. Signed: a period can spend more than it earns. */
  netCashFlow: Money;
  /**
   * §15 — adjustments are neither income nor expense, but they do move
   * balances. Reported separately so "why doesn't income minus expenses match
   * my balance change" has an answer on the page.
   */
  adjustments: { increase: Money; decrease: Money };
  /**
   * Qualifying rows behind these figures. §42 decides whether to render a
   * chart from this, never by comparing a money value to zero — a real month
   * can legitimately total ₱0.
   */
  rowCount: number;
};

export type MonthlyTrendPoint = CashFlowSummary & {
  /** YYYY-MM */
  month: string;
  /** e.g. "Jan" */
  label: string;
};

export type CategoryAggregate = {
  /** Null means the transaction carried no category. */
  categoryId: string | null;
  amount: Money;
};

/**
 * Which bucket a row belongs to — the single definition of §14 attribution.
 *
 * A refund belongs to the category, account and merchant of the purchase it
 * reverses, not to whatever was typed on the refund itself. Every breakdown
 * groups by these, and `lib/analytics/filter.ts` filters by them, so a
 * filtered page can never show a bucket it filtered out — the two operations
 * are asking the same question of the same row.
 *
 * For every non-refund type these are just the row's own fields, so income,
 * transfers and adjustments are unaffected.
 */
export function attributedCategoryId(row: AnalyticsRow): string | null {
  return isRefundRow(row) ? (row.refundOf?.categoryId ?? row.categoryId) : row.categoryId;
}

export function attributedAccountId(row: AnalyticsRow): string | null {
  return isRefundRow(row)
    ? (row.refundOf?.sourceAccountId ?? row.sourceAccountId)
    : row.sourceAccountId;
}

export function attributedMerchant(row: AnalyticsRow): string | null {
  return isRefundRow(row) ? (row.refundOf?.merchant ?? row.merchant) : row.merchant;
}

function isRefundRow(row: AnalyticsRow): boolean {
  return analyticsClass(row.type, row.status) === 'refund';
}

/** Rows that count toward official figures — §4. */
export function isQualifying(row: AnalyticsRow, currency: string): boolean {
  return row.status !== 'voided' && row.currency === currency;
}

/**
 * Income, gross expenses, refunds, net expenses and net cash flow for
 * whatever set of rows is passed in.
 *
 * The gross figure stays visible alongside the net so that a ₱20,000 purchase
 * refunded in the same month is still legible as activity rather than
 * vanishing (§14).
 */
export function summariseCashFlow(
  rows: readonly AnalyticsRow[],
  currency: string,
): CashFlowSummary {
  let income = 0n;
  let gross = 0n;
  let refunds = 0n;
  let increase = 0n;
  let decrease = 0n;
  let rowCount = 0;

  for (const row of rows) {
    if (!isQualifying(row, currency)) continue;
    rowCount += 1;

    // Adjustments are 'neutral' to analyticsClass, so they are counted here
    // by type before the switch rather than inside it (§15).
    if (row.type === 'adjustment') {
      if (row.direction === 'decrease') decrease += row.minor;
      else increase += row.minor;
    }

    switch (analyticsClass(row.type, row.status)) {
      case 'income':
        income += row.minor;
        break;
      case 'expense':
        gross += row.minor;
        break;
      case 'refund':
        refunds += row.minor;
        break;
      // Transfers, adjustments and opening balances move money without
      // earning or spending it, so they never reach these figures (§11–§13).
      default:
        break;
    }
  }

  const netExpenses = gross - refunds;

  return {
    income: money(income, currency),
    grossExpenses: money(gross, currency),
    refunds: money(refunds, currency),
    netExpenses: money(netExpenses, currency),
    netCashFlow: money(income - netExpenses, currency),
    adjustments: {
      increase: money(increase, currency),
      decrease: money(decrease, currency),
    },
    rowCount,
  };
}

/**
 * One point per month in `months`, oldest first.
 *
 * Months with no activity still produce a point, so the trend keeps an even
 * x-axis rather than silently closing gaps — a quiet January is information.
 */
export function bucketByMonth(
  rows: readonly AnalyticsRow[],
  months: readonly string[],
  currency: string,
): MonthlyTrendPoint[] {
  const buckets = new Map<string, AnalyticsRow[]>(months.map((m) => [m, []]));
  for (const row of rows) {
    buckets.get(row.date.slice(0, 7))?.push(row);
  }

  return months.map((month) => ({
    month,
    label: monthLabel(month),
    ...summariseCashFlow(buckets.get(month) ?? [], currency),
  }));
}

/**
 * Expenses grouped by category, net of refunds.
 *
 * §14: the refund is subtracted from the category of the ORIGINAL purchase,
 * not from whatever category the refund row itself carries — a return of a
 * ₱5,000 laptop must reduce Technology, not credit some "Refunds" bucket that
 * nothing was ever spent from. A standalone refund with no linked purchase
 * falls back to its own category.
 *
 * Categories netting to exactly zero are dropped; negative ones are kept —
 * see toSortedAggregates.
 */
export function spendingByCategory(
  rows: readonly AnalyticsRow[],
  currency: string,
): CategoryAggregate[] {
  return groupNet(rows, currency, attributedCategoryId);
}

/**
 * Expenses grouped by the account they left, net of refunds — §22.
 *
 * Same attribution rule as categories: the refund lands back on the account
 * the purchase was made from.
 */
export function spendingByAccount(
  rows: readonly AnalyticsRow[],
  currency: string,
): CategoryAggregate[] {
  return groupNet(rows, currency, attributedAccountId);
}

/**
 * Expenses grouped by merchant, net of refunds — §55.
 *
 * The raw `merchant_name`, deliberately un-normalised: §55 says "be aware of
 * naming inconsistency" and "do not build merchant-normalization AI yet", so
 * "SM" and "SM Supermarket" are two rows and the UI says as much rather than
 * guessing they are one shop.
 *
 * Rows with no merchant are grouped under a null key rather than dropped, so
 * the total still reconciles against net expenses.
 */
export function spendingByMerchant(
  rows: readonly AnalyticsRow[],
  currency: string,
): CategoryAggregate[] {
  return groupNet(rows, currency, attributedMerchant);
}

/** Income grouped by category — §23. Refunds never appear here (§11). */
export function incomeByCategory(
  rows: readonly AnalyticsRow[],
  currency: string,
): CategoryAggregate[] {
  const totals = new Map<string | null, bigint>();
  for (const row of rows) {
    if (!isQualifying(row, currency)) continue;
    if (analyticsClass(row.type, row.status) !== 'income') continue;
    totals.set(row.categoryId, (totals.get(row.categoryId) ?? 0n) + row.minor);
  }
  return toSortedAggregates(totals, currency);
}

function groupNet(
  rows: readonly AnalyticsRow[],
  currency: string,
  keyOf: (row: AnalyticsRow) => string | null,
): CategoryAggregate[] {
  const totals = new Map<string | null, bigint>();

  for (const row of rows) {
    if (!isQualifying(row, currency)) continue;
    const kind = analyticsClass(row.type, row.status);
    if (kind !== 'expense' && kind !== 'refund') continue;

    const key = keyOf(row);
    const signed = kind === 'expense' ? row.minor : -row.minor;
    totals.set(key, (totals.get(key) ?? 0n) + signed);
  }

  return toSortedAggregates(totals, currency);
}

/**
 * Largest first. Zero buckets are dropped, negative ones are **kept**.
 *
 * A category that a refund pushed below zero is real information, and keeping
 * it is what makes `Σ spendingByCategory === netExpenses` hold — the identity
 * the §34 tests assert. Charts filter to positive slices at the view layer,
 * where a "2 categories net-refunded ₱1,200" line can say what was left out;
 * an aggregator that quietly discarded them could not.
 */
function toSortedAggregates(
  totals: ReadonlyMap<string | null, bigint>,
  currency: string,
): CategoryAggregate[] {
  return [...totals.entries()]
    .filter(([, minor]) => minor !== 0n)
    .map(([categoryId, minor]) => ({ categoryId, amount: money(minor, currency) }))
    .sort((a, b) => (a.amount.minor > b.amount.minor ? -1 : 1));
}

/** Total of a set of aggregates — the donut's centre figure. */
export function totalOf(
  aggregates: readonly CategoryAggregate[],
  currency: string,
): Money {
  return aggregates.reduce(
    (acc, a) => money(acc.minor + a.amount.minor, currency),
    zero(currency),
  );
}
