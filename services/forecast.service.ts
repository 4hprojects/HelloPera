import 'server-only';

import { listAccounts } from '@/services/account.service';
import { listObligations } from '@/services/obligation.service';
import { getUpcomingExpectedEvents } from '@/services/expected-event.service';
import { generateOccurrences } from '@/services/recurring-rule.service';
import {
  addDays,
  confidenceFor,
  includesEvent,
  projectBalance,
} from '@/lib/forecast/project';
import { isLiquid } from '@/lib/finance/types';
import { sum, zero } from '@/lib/money';
import { log } from '@/lib/log';
import type {
  ForecastAssumptions,
  ForecastData,
  ForecastEvent,
  Horizon,
} from '@/types/forecast';

/**
 * Forecast assembly — PHASE-07 §30 to §37, §45, §46, §69.
 *
 * Thin by design. The arithmetic is in `lib/forecast/project.ts`, where it is
 * unit-testable; anything under `services/` imports `server-only` and cannot
 * be reached from a test. This file only gathers rows and shapes them.
 *
 * §69 says not to load all future events into the browser and recompute
 * authoritative totals there. Nothing here reaches the browser: the page is a
 * server component and receives finished figures.
 */

export type ForecastOptions = {
  horizon: Horizon;
  currency: string;
  /** §31 — off by default; collection is the least certain input. */
  includeReceivables: boolean;
};

/**
 * §19 — the lazy safety check.
 *
 * pg_cron generates hourly, but a forecast rendered against rules that have
 * never been generated would be quietly empty, and §19 is explicit that
 * generation must not depend only on the user opening the app. Running it here
 * too costs one scoped call and makes the page correct even where pg_cron
 * could not be enabled (§2).
 *
 * Deliberately swallows its error: generation failing is a reason to show a
 * slightly stale forecast, not to replace the page with an error. The failure
 * is recorded in `job_runs` either way.
 */
async function ensureGenerated(userId: string): Promise<void> {
  try {
    const result = await generateOccurrences(userId, 90);
    if (result.skipped) {
      log.info('forecast: generation already running', { m: result.reason });
    }
  } catch (error) {
    log.error('forecast: lazy generation failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
  }
}

export async function getForecast(
  userId: string,
  today: string,
  options: ForecastOptions,
): Promise<ForecastData> {
  await ensureGenerated(userId);

  const { horizon, currency, includeReceivables } = options;
  const end = addDays(today, horizon);

  const [accounts, bills, expectedIncome, receivables, events] = await Promise.all([
    listAccounts(),
    listObligations('bill', today, { onlyOpen: true, from: today, to: end }),
    listObligations('expected_income', today, { onlyOpen: true, from: today, to: end }),
    includeReceivables
      ? listObligations('receivable', today, { onlyOpen: true, from: today, to: end })
      : Promise.resolve([]),
    getUpcomingExpectedEvents(today, end),
  ]);

  // §32, §33 — the projection is a CASH position. Liquid asset accounts only:
  // an investment is an asset but not money to spend this month, and a
  // liability's balance is a debt, never cash.
  const liquid = accounts.filter(
    (a) => isLiquid(a.type, a.nature) && a.currency_code === currency,
  );
  const excluded = accounts
    .filter((a) => a.currency_code === currency && !isLiquid(a.type, a.nature))
    .map((a) => ({
      name: a.name,
      reason:
        a.nature === 'liability'
          ? 'Liability, not spendable cash'
          : 'Not a liquid account',
    }));

  const openingBalance = liquid.length
    ? sum(
        liquid.map((a) => a.balance),
        currency,
      )
    : zero(currency);

  const forecastEvents: ForecastEvent[] = [];

  for (const bill of bills) {
    if (bill.currency !== currency || !bill.date) continue;
    forecastEvents.push({
      id: `bill:${bill.id}`,
      date: bill.date,
      kind: 'bill',
      label: bill.name,
      // §49 — what is still owed, not the original total.
      amount: bill.remaining,
      direction: 'out',
      confidence: confidenceFor('bill'),
      href: `/bills`,
    });
  }

  for (const income of expectedIncome) {
    if (income.currency !== currency || !income.date) continue;
    forecastEvents.push({
      id: `expected_income:${income.id}`,
      date: income.date,
      kind: 'expected_income',
      label: income.name,
      amount: income.remaining,
      direction: 'in',
      confidence: confidenceFor('expected_income'),
      href: `/expected-income`,
    });
  }

  for (const receivable of receivables) {
    if (receivable.currency !== currency || !receivable.date) continue;
    forecastEvents.push({
      id: `receivable:${receivable.id}`,
      date: receivable.date,
      kind: 'receivable',
      label: receivable.name,
      amount: receivable.remaining,
      direction: 'in',
      confidence: confidenceFor('receivable'),
      href: `/receivables`,
    });
  }

  for (const event of events) {
    if (event.amount.currency !== currency) continue;
    // §39, §41, §42, §43 — fulfilled, skipped, cancelled and excluded events
    // all stay out. A fulfilled one has already moved the balance.
    if (!includesEvent(event)) continue;

    forecastEvents.push({
      id: `event:${event.id}`,
      date: event.scheduledDate,
      kind: 'expected_event',
      label: event.name,
      amount: event.amount,
      direction: event.eventType === 'income' ? 'in' : 'out',
      confidence: confidenceFor('expected_event'),
      href: '/recurring',
    });
  }

  const forecast = projectBalance({
    currency,
    openingBalance,
    today,
    horizon,
    events: forecastEvents,
  });

  // §46 — every currency the user holds, so the selector can offer them and
  // the page can say plainly that only one is shown.
  const currencies = [...new Set(accounts.map((a) => a.currency_code))].sort((a, b) =>
    a === currency ? -1 : b === currency ? 1 : a.localeCompare(b),
  );

  const assumptions: ForecastAssumptions = {
    includeReceivables,
    liquidAccounts: liquid.map((a) => a.name),
    excludedAccounts: excluded,
    horizonDays: horizon,
    currency,
    multiCurrency: currencies.length > 1,
  };

  return { forecast, assumptions, currencies };
}
