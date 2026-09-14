import 'server-only';

import { getAnalyticsData } from '@/services/analytics.service';
import { listAccounts, summarise } from '@/services/account.service';
import { listCategories } from '@/services/category.service';
import { getRecentTransactions, listTransactions } from '@/services/transaction.service';
import { listObligations, type Obligation } from '@/services/obligation.service';
import { getForecast } from '@/services/forecast.service';
import { HORIZONS, type Horizon } from '@/types/forecast';
import { sum, zero, type Money } from '@/lib/money';
import { MAX_RESULT_ROWS, type PlanContext, type ValidatedPlan } from '@/lib/ai/plan';
import type { AiAnswerResult, AiItem } from '@/types/ai';

/**
 * The approved query catalog — PHASE-12 §11, §65, §66, §67.
 *
 * §66 is the rule this file exists to make true: "No Dynamic SQL from Model".
 * Every intent below resolves to a function that already existed before Phase
 * 12 and is already used by a page — `getAnalyticsData` powers /analytics,
 * `listObligations` powers /bills, `getForecast` powers /forecast.
 *
 * That reuse is not laziness, it is the mechanism behind two acceptance
 * criteria. Criterion 12 says spending answers must match the dashboard, and
 * criterion 4 says queries go through an approved layer: both are satisfied
 * for free when the assistant calls the very same function the dashboard does.
 * A second query path written "just for the assistant" would be a second place
 * for a scoping bug to live and a second set of numbers to keep in step.
 *
 * §67 — every one of these is parameterised by construction; none of them
 * takes a string that becomes SQL. And all of them read through the
 * RLS-scoped client, so user scoping (criterion 5) does not depend on anything
 * in this file being right.
 */

/** A capped list plus whether there was more — §48, §49. */
function capped<T>(rows: readonly T[], limit: number): { rows: T[]; truncated: boolean } {
  const take = Math.min(limit, MAX_RESULT_ROWS);
  return { rows: rows.slice(0, take), truncated: rows.length > take };
}

function analyticsRange(plan: ValidatedPlan) {
  return {
    range: plan.range.preset === 'custom' ? ('custom' as const) : plan.range.preset,
    from: plan.range.from,
    to: plan.range.to,
    currency: plan.currency,
    accountId: plan.accountId ?? undefined,
    categoryId: plan.categoryId ?? undefined,
  };
}

/**
 * Run the analytics engine for a plan's window.
 *
 * Deliberately the same entry point the page uses, including its filter
 * resolution — so a stale account id is dropped the same way in both places
 * rather than producing a silent empty set here.
 */
async function analyticsFor(
  plan: ValidatedPlan,
  context: PlanContext,
  window = plan.range,
) {
  return getAnalyticsData({
    timezone: context.timezone,
    preferredCurrency: plan.currency,
    params: {
      ...analyticsRange(plan),
      range: 'custom',
      from: window.from,
      to: window.to,
      dropped: [],
    },
  });
}

/** §31 — merchant match is a contains filter on the already-aggregated rows. */
function matchMerchant(
  rows: readonly { label: string; amount: Money }[],
  merchant: string | null,
) {
  if (!merchant) return rows;
  const needle = merchant.trim().toLowerCase();
  return rows.filter((r) => r.label.toLowerCase().includes(needle));
}

function toItems(rows: readonly { label: string; amount: Money }[]): AiItem[] {
  return rows.map((r) => ({ label: r.label, amount: r.amount }));
}

function obligationItems(rows: readonly Obligation[]): AiItem[] {
  return rows.map((o) => ({
    label: o.name || 'Unnamed',
    amount: o.remaining,
    date: o.date,
    // The word carries the state; §7 of Phase 00 forbids colour alone, and an
    // assistant answer has no colour at all.
    hint: o.display.replace(/_/g, ' '),
  }));
}

/** The nearest offered horizon at or above what the plan asked for — §34. */
function horizonFor(range: { from: string; to: string }): Horizon {
  const days = Math.round(
    (Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) /
      86_400_000,
  );
  return HORIZONS.find((h) => h >= days) ?? HORIZONS[HORIZONS.length - 1]!;
}

/**
 * Execute a validated plan.
 *
 * Takes a `ValidatedPlan`, never raw model output — the type is the guarantee
 * that `lib/ai/plan.ts` has already checked ownership, currency, entitlement
 * and caps. There is no path into this function that skips that.
 */
export async function executePlan(
  plan: ValidatedPlan,
  context: PlanContext,
): Promise<AiAnswerResult> {
  const base: AiAnswerResult = {
    intent: plan.intent,
    range: { from: plan.range.from, to: plan.range.to, label: plan.range.label },
    currency: plan.currency,
    figures: [],
    items: [],
    truncated: false,
    comparison: null,
    href: null,
    hrefLabel: null,
    empty: false,
    assumptions: [],
  };

  switch (plan.intent) {
    case 'spending_total':
    case 'income_total':
    case 'cash_flow':
    case 'spending_by_category':
    case 'spending_by_account':
    case 'income_by_category':
    case 'merchant_spending':
    case 'monthly_comparison':
    case 'category_comparison':
      return analyticsIntent(plan, context, base);

    case 'account_balance':
    case 'net_position':
      return positionIntent(plan, base);

    case 'recent_transactions':
    case 'largest_expenses':
      return transactionIntent(plan, base);

    case 'bills_due':
    case 'overdue_bills':
    case 'receivables_outstanding':
    case 'overdue_receivables':
    case 'expected_income':
      return obligationIntent(plan, context, base);

    case 'forecast_summary':
      return forecastIntent(plan, context, base);
  }
}

async function analyticsIntent(
  plan: ValidatedPlan,
  context: PlanContext,
  base: AiAnswerResult,
): Promise<AiAnswerResult> {
  const data = await analyticsFor(plan, context);
  const { cashFlow } = data;

  const figures = (() => {
    switch (plan.intent) {
      case 'income_total':
      case 'income_by_category':
        return [{ label: 'Income', amount: cashFlow.income }];
      case 'cash_flow':
        return [
          { label: 'Income', amount: cashFlow.income },
          { label: 'Spending', amount: cashFlow.netExpenses },
          { label: 'Net', amount: cashFlow.netCashFlow },
        ];
      default:
        return [{ label: 'Spending', amount: cashFlow.netExpenses }];
    }
  })();

  const breakdown = (() => {
    switch (plan.intent) {
      case 'spending_by_account':
        return data.spendingByAccount;
      case 'income_by_category':
        return data.incomeByCategory;
      case 'merchant_spending':
        return matchMerchant(data.spendingByMerchant, plan.merchant);
      case 'spending_by_category':
      case 'category_comparison':
        return data.spendingByCategory;
      default:
        return [];
    }
  })();

  const { rows, truncated } = capped(breakdown, plan.limit);

  // §31 — a merchant that matched nothing is not the same as spending nothing
  // there. Report the filtered figure, not the period total.
  const figuresOut =
    plan.intent === 'merchant_spending'
      ? [
          {
            label: plan.merchant ?? 'Merchant',
            amount: sum(
              rows.map((r) => r.amount),
              plan.currency,
            ),
          },
        ]
      : figures;

  let comparison: AiAnswerResult['comparison'] = null;
  if (plan.comparison) {
    // The same executor over the other window. Computing a comparison any
    // other way is how it ends up measured over a different number of days
    // than the figure it is compared against.
    const other = await analyticsFor(plan, context, plan.comparison);
    comparison = {
      label: plan.comparison.label,
      figures:
        plan.intent === 'income_total' || plan.intent === 'income_by_category'
          ? [{ label: 'Income', amount: other.cashFlow.income }]
          : [{ label: 'Spending', amount: other.cashFlow.netExpenses }],
    };
  }

  const href = new URLSearchParams({
    range: 'custom',
    from: plan.range.from,
    to: plan.range.to,
    currency: plan.currency,
  });
  if (plan.accountId) href.set('accountId', plan.accountId);
  if (plan.categoryId) href.set('categoryId', plan.categoryId);

  return {
    ...base,
    figures: figuresOut,
    items: toItems(rows),
    truncated,
    comparison,
    href: `/analytics?${href.toString()}`,
    hrefLabel: 'Open in analytics',
    // §25 — rowCount, not a zero total. A real month can legitimately be ₱0.
    empty: cashFlow.rowCount === 0,
    assumptions: data.rejected.map((r) => `Ignored the ${r.field} filter: ${r.reason}`),
  };
}

async function positionIntent(
  plan: ValidatedPlan,
  base: AiAnswerResult,
): Promise<AiAnswerResult> {
  const accounts = await listAccounts();
  const inCurrency = accounts.filter((a) => a.currency_code === plan.currency);

  if (plan.intent === 'account_balance' && plan.accountId) {
    const account = inCurrency.find((a) => a.id === plan.accountId);
    return {
      ...base,
      figures: account
        ? [{ label: account.name, amount: account.balance }]
        : [{ label: 'Balance', amount: zero(plan.currency) }],
      empty: !account,
      href: '/accounts',
      hrefLabel: 'Open accounts',
      // §71 — a balance is as current as the last transaction recorded, and
      // saying so is the difference between a figure and a promise.
      assumptions: ['Balances reflect the transactions you have recorded.'],
    };
  }

  const positions = summarise(inCurrency);
  const position = positions.find((p) => p.currency === plan.currency);
  const { rows, truncated } = capped(
    inCurrency.map((a) => ({ label: a.name, amount: a.balance })),
    plan.limit,
  );

  return {
    ...base,
    figures: position
      ? [
          { label: 'Assets', amount: position.assets },
          { label: 'Liabilities', amount: position.liabilities },
          { label: 'Net position', amount: position.net },
        ]
      : [{ label: 'Net position', amount: zero(plan.currency) }],
    items: toItems(rows),
    truncated,
    empty: inCurrency.length === 0,
    href: '/accounts',
    hrefLabel: 'Open accounts',
    assumptions: ['Balances reflect the transactions you have recorded.'],
  };
}

async function transactionIntent(
  plan: ValidatedPlan,
  base: AiAnswerResult,
): Promise<AiAnswerResult> {
  const params = new URLSearchParams({ from: plan.range.from, to: plan.range.to });

  if (plan.intent === 'recent_transactions') {
    const rows = await getRecentTransactions(Math.min(plan.limit, MAX_RESULT_ROWS));
    const mine = rows.filter((t) => t.currency_code === plan.currency);
    return {
      ...base,
      items: mine.map((t) => ({
        label: t.merchant_name || t.description || 'Transaction',
        amount: t.amount,
        date: t.transaction_date,
        hint: t.type,
      })),
      empty: mine.length === 0,
      href: '/transactions',
      hrefLabel: 'Open transactions',
    };
  }

  // largest_expenses — the existing filter, sorted by amount. No new query.
  const result = await listTransactions({
    from: plan.range.from,
    to: plan.range.to,
    type: 'expense',
    accountId: plan.accountId ?? undefined,
    categoryId: plan.categoryId ?? undefined,
    sort: 'highest',
    page: 1,
  });

  const mine = result.transactions.filter((t) => t.currency_code === plan.currency);
  const { rows, truncated } = capped(mine, plan.limit);
  params.set('sort', 'highest');
  params.set('type', 'expense');

  return {
    ...base,
    figures: [
      {
        label: 'Total shown',
        amount: sum(
          rows.map((t) => t.amount),
          plan.currency,
        ),
      },
    ],
    items: rows.map((t) => ({
      label: t.merchant_name || t.description || 'Expense',
      amount: t.amount,
      date: t.transaction_date,
    })),
    truncated: truncated || result.total > rows.length,
    empty: mine.length === 0,
    href: `/transactions?${params.toString()}`,
    hrefLabel: 'Open transactions',
  };
}

async function obligationIntent(
  plan: ValidatedPlan,
  context: PlanContext,
  base: AiAnswerResult,
): Promise<AiAnswerResult> {
  const kind =
    plan.intent === 'bills_due' || plan.intent === 'overdue_bills'
      ? 'bill'
      : plan.intent === 'expected_income'
        ? 'expected_income'
        : 'receivable';

  const overdue =
    plan.intent === 'overdue_bills' || plan.intent === 'overdue_receivables';

  const rows = await listObligations(kind, context.today, {
    onlyOpen: true,
    // An overdue question looks backwards from today; everything else looks
    // forward across the plan's window.
    ...(overdue ? { to: context.today } : { from: plan.range.from, to: plan.range.to }),
  });

  const mine = rows.filter(
    (o) => o.currency === plan.currency && (!overdue || o.display === 'overdue'),
  );
  const { rows: shown, truncated } = capped(mine, plan.limit);

  const href =
    kind === 'bill'
      ? '/bills'
      : kind === 'receivable'
        ? '/receivables'
        : '/expected-income';

  return {
    ...base,
    figures: [
      {
        label: overdue ? 'Overdue' : 'Outstanding',
        amount: sum(
          mine.map((o) => o.remaining),
          plan.currency,
        ),
      },
    ],
    items: obligationItems(shown),
    truncated,
    empty: mine.length === 0,
    href,
    hrefLabel: `Open ${kind === 'expected_income' ? 'expected income' : `${kind}s`}`,
    // §80 — the assistant can only see what has been recorded, and for
    // obligations that gap is the whole point of the answer.
    assumptions: ['Only obligations you have recorded are included.'],
  };
}

async function forecastIntent(
  plan: ValidatedPlan,
  context: PlanContext,
  base: AiAnswerResult,
): Promise<AiAnswerResult> {
  const { forecast, assumptions } = await getForecast(context.userId, context.today, {
    horizon: horizonFor(plan.range),
    currency: plan.currency,
    includeReceivables: false,
  });

  const figures = [
    { label: 'Opening balance', amount: forecast.openingBalance },
    { label: 'Expected in', amount: forecast.totalInflows },
    { label: 'Expected out', amount: forecast.totalOutflows },
    { label: `Projected in ${forecast.horizon} days`, amount: forecast.closingBalance },
  ];

  const { rows, truncated } = capped(forecast.timeline, plan.limit);

  const stated = [
    // §45 of Phase 07 — an unexplained projection is a guess. These are the
    // same assumptions the /forecast page states.
    `Based on the accounts: ${assumptions.liquidAccounts.join(', ') || 'none'}.`,
    ...(assumptions.includeReceivables
      ? []
      : ['Money owed to you is not counted, because collection is uncertain.']),
    ...assumptions.excludedAccounts.map((a) => `${a.name} is excluded: ${a.reason}`),
  ];

  return {
    ...base,
    figures,
    items: rows.map((e) => ({
      label: e.label,
      amount: e.amount,
      date: e.date,
      hint: e.confidence,
    })),
    truncated,
    empty: forecast.timeline.length === 0,
    href: '/forecast',
    hrefLabel: 'Open forecast',
    assumptions: forecast.shortfall
      ? [
          `Your balance is projected to go below zero on ${forecast.shortfall.date}.`,
          ...stated,
        ]
      : stated,
  };
}

/**
 * Everything the validator needs about the user, resolved once per question.
 *
 * §13 — the user id comes from the session, never from the model. It is not a
 * parameter the parser can influence, and there is no code path that reads one
 * out of a question.
 */
export async function buildPlanContext(params: {
  userId: string;
  timezone: string;
  today: string;
  defaultCurrency: string;
  advancedAnalytics: boolean;
  forecastHorizonDays: number;
}): Promise<PlanContext> {
  const [accounts, categories] = await Promise.all([listAccounts(), listCategories()]);

  const currencies = [...new Set(accounts.map((a) => a.currency_code))];

  return {
    userId: params.userId,
    timezone: params.timezone,
    today: params.today,
    // A user with no accounts still has a default currency, or every question
    // would be refused before it was understood.
    currencies: currencies.length > 0 ? currencies : [params.defaultCurrency],
    defaultCurrency: params.defaultCurrency,
    accounts: accounts.map((a) => ({ id: a.id, name: a.name })),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    advancedAnalytics: params.advancedAnalytics,
    forecastHorizonDays: params.forecastHorizonDays,
  };
}
