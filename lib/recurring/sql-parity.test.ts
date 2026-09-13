import { describe, expect, it } from 'vitest';
import {
  FREQUENCIES,
  occurrenceAt,
  type Frequency,
  type RecurrenceRule,
} from '@/lib/recurring/schedule';

/**
 * Parity between the TypeScript recurrence walk and the SQL one.
 *
 * `occurrence_at()` in
 * supabase/migrations/20260914000100_phase07_generation_orchestrator.sql is a
 * second implementation of `occurrenceAt()`. It exists because Phase 07 §2
 * puts the scheduler inside Postgres — HelloDeploy has no scheduler — so the
 * generation job must decide which dates to create with no application in the
 * loop.
 *
 * Two hand-written copies of one rule is how a system drifts. This is the same
 * device `lib/finance/sql-parity.test.ts` uses for the balance matrix.
 *
 * `sqlOccurrenceAt` below is a faithful transcription of the PL/pgSQL. If the
 * migration changes, change this too — the test then proves the two still
 * agree, across exactly the cases that break recurrence in practice.
 */

function ymd(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

function parse(date: string): { y: number; m: number; d: number } {
  return {
    y: Number(date.slice(0, 4)),
    m: Number(date.slice(5, 7)),
    d: Number(date.slice(8, 10)),
  };
}

/** Postgres `+ integer` on a date: whole days. */
function addDays(date: string, days: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

/** Postgres `extract(isodow from ...)`: 1 = Monday … 7 = Sunday. */
function isodow(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Transcription of public.occurrence_at(). Mirrors the PL/pgSQL statement for
 * statement, including its explicit `least(...)` clamp rather than relying on
 * interval arithmetic.
 */
function sqlOccurrenceAt(
  frequency: string,
  intervalCount: number,
  startDate: string,
  dayOfMonth: number | null,
  dayOfWeek: number | null,
  step: number,
): string {
  // v_day_step := case p_frequency when 'weekly' then 7 when 'biweekly' then 14 else null end;
  const dayStep = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : null;

  if (dayStep !== null) {
    let base = startDate;
    if (dayOfWeek !== null) {
      // v_shift := (p_day_of_week - extract(isodow from p_start_date) + 7) % 7;
      const shift = (dayOfWeek - isodow(startDate) + 7) % 7;
      base = addDays(base, shift);
    }
    return addDays(base, step * dayStep * intervalCount);
  }

  // v_month_step := case ... when 'monthly' then 1 when 'quarterly' then 3 when 'yearly' then 12 else 1 end;
  const monthStep =
    frequency === 'monthly'
      ? 1
      : frequency === 'quarterly'
        ? 3
        : frequency === 'yearly'
          ? 12
          : 1;

  const start = parse(startDate);
  // v_anchor_day := coalesce(p_day_of_month, extract(day from p_start_date));
  const anchorDay = dayOfMonth ?? start.d;
  // v_months := p_step * v_month_step * p_interval_count;
  const months = step * monthStep * intervalCount;

  // v_first := (date_trunc('month', start) + make_interval(months => v_months))::date;
  const firstIndex = start.y * 12 + (start.m - 1) + months;
  const fy = Math.floor(firstIndex / 12);
  const fm = (((firstIndex % 12) + 12) % 12) + 1;

  // v_day := least(anchor, extract(day from (v_first + interval '1 month' - interval '1 day')));
  const lastDayOfMonth = new Date(Date.UTC(fy, fm, 0)).getUTCDate();
  const day = Math.min(anchorDay, lastDayOfMonth);

  // return v_first + (v_day - 1);
  return ymd(fy, fm, day);
}

function check(rule: RecurrenceRule, step: number): void {
  const ts = occurrenceAt(rule, step);
  const sql = sqlOccurrenceAt(
    rule.frequency,
    rule.intervalCount,
    rule.startDate,
    rule.dayOfMonth ?? null,
    rule.dayOfWeek ?? null,
    step,
  );
  expect(
    sql,
    `step ${step} of ${rule.frequency}/${rule.intervalCount} from ${rule.startDate}` +
      ` (dom=${rule.dayOfMonth ?? '-'}, dow=${rule.dayOfWeek ?? '-'})`,
  ).toBe(ts);
}

describe('SQL ↔ TypeScript recurrence parity — §8-§11', () => {
  it('agrees across every frequency and interval over two years of steps', () => {
    const starts = ['2026-01-15', '2026-03-01', '2026-12-31'];
    for (const frequency of FREQUENCIES) {
      for (const intervalCount of [1, 2, 3]) {
        for (const startDate of starts) {
          for (let step = 0; step <= 24; step += 1) {
            check({ frequency, intervalCount, startDate }, step);
          }
        }
      }
    }
  });

  it('agrees on month-end clamping — the 31st across a full year (§10)', () => {
    // The case the anchor rule exists for: Feb clamps, March must not.
    for (let step = 0; step <= 14; step += 1) {
      check({ frequency: 'monthly', intervalCount: 1, startDate: '2026-01-31' }, step);
    }
  });

  it('agrees on 29 February in and out of leap years', () => {
    for (const frequency of ['monthly', 'quarterly', 'yearly'] as Frequency[]) {
      for (let step = 0; step <= 16; step += 1) {
        check({ frequency, intervalCount: 1, startDate: '2024-02-29' }, step);
      }
    }
  });

  it('agrees on an explicit day_of_month that overrides the start day', () => {
    for (const dayOfMonth of [1, 15, 28, 29, 30, 31]) {
      for (let step = 0; step <= 14; step += 1) {
        check(
          { frequency: 'monthly', intervalCount: 1, startDate: '2026-01-05', dayOfMonth },
          step,
        );
      }
    }
  });

  it('agrees on every weekday shift for weekly and biweekly rules (§11)', () => {
    for (const frequency of ['weekly', 'biweekly'] as Frequency[]) {
      for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek += 1) {
        for (let step = 0; step <= 12; step += 1) {
          check(
            { frequency, intervalCount: 1, startDate: '2026-09-14', dayOfWeek },
            step,
          );
        }
      }
    }
  });

  it('agrees across a year boundary', () => {
    for (const frequency of FREQUENCIES) {
      for (let step = 0; step <= 18; step += 1) {
        check({ frequency, intervalCount: 1, startDate: '2026-11-30' }, step);
      }
    }
  });
});
