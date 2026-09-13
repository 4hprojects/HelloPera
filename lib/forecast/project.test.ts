import { describe, expect, it } from 'vitest';
import {
  addDays,
  confidenceFor,
  includesEvent,
  netChange,
  projectBalance,
} from '@/lib/forecast/project';
import { money, type Money } from '@/lib/money';
import type { ForecastEvent, Horizon } from '@/types/forecast';

const PHP = 'PHP';
const php = (major: number): Money => money(BigInt(Math.round(major * 100)), PHP);

let seq = 0;
function event(over: Partial<ForecastEvent> = {}): ForecastEvent {
  seq += 1;
  return {
    id: over.id ?? `e${String(seq).padStart(3, '0')}`,
    date: '2026-09-20',
    kind: 'bill',
    label: 'Internet',
    amount: php(1799),
    direction: 'out',
    confidence: 'scheduled',
    href: null,
    ...over,
  };
}

function run(
  events: ForecastEvent[],
  opening = php(50_000),
  horizon: Horizon = 30,
  today = '2026-09-14',
) {
  return projectBalance({
    currency: PHP,
    openingBalance: opening,
    today,
    horizon,
    events,
  });
}

describe('projectBalance — §29 the formula', () => {
  it('closes at opening + inflows − outflows', () => {
    const f = run([
      event({
        date: '2026-09-15',
        direction: 'in',
        amount: php(30_000),
        label: 'Salary',
      }),
      event({ date: '2026-09-18', direction: 'out', amount: php(2_845) }),
      event({ date: '2026-09-20', direction: 'out', amount: php(1_799) }),
    ]);

    expect(f.totalInflows).toEqual(php(30_000));
    expect(f.totalOutflows).toEqual(php(4_644));
    expect(f.closingBalance).toEqual(php(75_356));
    expect(netChange(f)).toEqual(php(25_356));
  });

  it('leaves the balance untouched when nothing is scheduled', () => {
    const f = run([]);
    expect(f.closingBalance).toEqual(php(50_000));
    expect(f.shortfall).toBeNull();
  });

  it('emits a point for every day including empty ones', () => {
    // A chart that skipped quiet days would compress time and draw a slope
    // that never happened.
    for (const horizon of [30, 60, 90] as Horizon[]) {
      const f = run([], php(1_000), horizon);
      expect(f.points).toHaveLength(horizon + 1);
      expect(f.points[0]!.date).toBe('2026-09-14');
      expect(f.points.at(-1)!.date).toBe(addDays('2026-09-14', horizon));
    }
  });

  it('carries each day’s closing into the next day’s opening', () => {
    const f = run([event({ date: '2026-09-16', direction: 'out', amount: php(500) })]);
    for (let i = 1; i < f.points.length; i += 1) {
      expect(f.points[i]!.openingProjectedBalance).toEqual(
        f.points[i - 1]!.closingProjectedBalance,
      );
    }
  });
});

describe('horizons — §34', () => {
  it('includes an event on the final day and excludes the one after', () => {
    const inside = event({ date: addDays('2026-09-14', 30), amount: php(100) });
    const outside = event({ date: addDays('2026-09-14', 31), amount: php(100) });

    const f = run([inside, outside], php(1_000), 30);
    expect(f.timeline.map((e) => e.id)).toEqual([inside.id]);
    expect(f.totalOutflows).toEqual(php(100));
  });

  it('a 90-day window sees what a 30-day one does not', () => {
    const far = event({ date: addDays('2026-09-14', 75), amount: php(9_000) });
    expect(run([far], php(50_000), 30).totalOutflows).toEqual(php(0));
    expect(run([far], php(50_000), 90).totalOutflows).toEqual(php(9_000));
  });

  it('excludes anything dated before today', () => {
    // Yesterday's bill either was paid — and already moved the balance — or is
    // overdue, which is the dashboard's job, not the projection's.
    const f = run([event({ date: '2026-09-13', amount: php(500) })]);
    expect(f.timeline).toHaveLength(0);
    expect(f.closingBalance).toEqual(php(50_000));
  });
});

describe('shortfall — §54, §55', () => {
  it('reports the FIRST date below zero, not the worst', () => {
    const f = run(
      [
        event({ id: 'a', date: '2026-09-16', amount: php(1_200) }),
        event({ id: 'b', date: '2026-09-20', amount: php(5_000) }),
      ],
      php(1_000),
    );

    expect(f.shortfall).not.toBeNull();
    // 1000 − 1200 = −200 on the 16th; the 20th is deeper but later.
    expect(f.shortfall!.date).toBe('2026-09-16');
    expect(f.shortfall!.amount).toEqual(php(200));
  });

  it('reports the shortfall as a positive figure', () => {
    const f = run([event({ date: '2026-09-15', amount: php(3_000) })], php(1_000));
    expect(f.shortfall!.amount).toEqual(php(2_000));
    expect(f.shortfall!.amount.minor > 0n).toBe(true);
  });

  it('names the events that drove it there, and not later ones', () => {
    const f = run(
      [
        event({ id: 'early', date: '2026-09-15', amount: php(2_000) }),
        event({ id: 'later', date: '2026-09-25', amount: php(500) }),
      ],
      php(1_000),
    );
    expect(f.shortfall!.contributors.map((e) => e.id)).toEqual(['early']);
  });

  it('is null when the balance only dips but stays at or above zero', () => {
    const f = run([event({ date: '2026-09-15', amount: php(1_000) })], php(1_000));
    expect(f.shortfall).toBeNull();
  });

  it('still reports a shortfall that a later inflow recovers from', () => {
    // Recovery does not undo the fact that a payment would bounce on the 16th.
    const f = run(
      [
        event({ id: 'out', date: '2026-09-16', amount: php(2_000) }),
        event({ id: 'in', date: '2026-09-17', direction: 'in', amount: php(9_000) }),
      ],
      php(1_000),
    );
    expect(f.shortfall!.date).toBe('2026-09-16');
    expect(f.closingBalance).toEqual(php(8_000));
  });
});

describe('event inclusion — §39, §41, §42, §43', () => {
  it('counts a scheduled event', () => {
    expect(includesEvent({ status: 'scheduled' })).toBe(true);
  });

  it('drops skipped and cancelled occurrences', () => {
    expect(includesEvent({ status: 'skipped' })).toBe(false);
    expect(includesEvent({ status: 'cancelled' })).toBe(false);
  });

  it('drops a fulfilled event so it is not double-counted', () => {
    // It already became a real transaction that moved the balance.
    expect(includesEvent({ status: 'fulfilled' })).toBe(false);
  });

  it('honours include_in_forecast regardless of status', () => {
    expect(includesEvent({ status: 'scheduled', includeInForecast: false })).toBe(false);
    expect(includesEvent({ status: 'scheduled', includeInForecast: true })).toBe(true);
  });
});

describe('confidence — §44', () => {
  it('labels sources without inventing percentages', () => {
    expect(confidenceFor('bill')).toBe('scheduled');
    expect(confidenceFor('expected_event')).toBe('scheduled');
    expect(confidenceFor('expected_income')).toBe('expected');
    expect(confidenceFor('receivable')).toBe('optional');
  });
});

describe('currency safety — §46', () => {
  it('refuses to mix currencies rather than inventing a total', () => {
    // lib/money throws on mismatch. A forecast is exactly where a fabricated
    // combined number would get acted on.
    expect(() =>
      projectBalance({
        currency: PHP,
        openingBalance: php(1_000),
        today: '2026-09-14',
        horizon: 30,
        events: [event({ date: '2026-09-15', amount: money(5_000n, 'USD') })],
      }),
    ).toThrow(/does not convert currencies/i);
  });
});

describe('ordering', () => {
  it('returns the timeline oldest first', () => {
    const f = run([
      event({ id: 'c', date: '2026-09-25' }),
      event({ id: 'a', date: '2026-09-15' }),
      event({ id: 'b', date: '2026-09-20' }),
    ]);
    expect(f.timeline.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('orders two events on the same day stably', () => {
    const f = run([
      event({ id: 'zzz', date: '2026-09-15' }),
      event({ id: 'aaa', date: '2026-09-15' }),
    ]);
    expect(f.timeline.map((e) => e.id)).toEqual(['aaa', 'zzz']);
    expect(f.points.find((p) => p.date === '2026-09-15')!.events).toHaveLength(2);
  });
});

describe('addDays', () => {
  it('crosses month and year boundaries', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('is unaffected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
        process.env.TZ = tz;
        expect(addDays('2026-09-14', 30)).toBe('2026-10-14');
      }
    } finally {
      process.env.TZ = original;
    }
  });
});
