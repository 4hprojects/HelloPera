import { describe, expect, it } from 'vitest';
import {
  daysInMonth,
  describeRule,
  firstOccurrenceOnOrAfter,
  initialCursor,
  isoDayOfWeek,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  type RecurrenceRule,
} from './schedule';

function rule(over: Partial<RecurrenceRule> = {}): RecurrenceRule {
  return { frequency: 'monthly', intervalCount: 1, startDate: '2026-01-15', ...over };
}

describe('daysInMonth', () => {
  it('knows the short months and leap years', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2000, 2)).toBe(29); // divisible by 400
    expect(daysInMonth(1900, 2)).toBe(28); // divisible by 100, not 400
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('isoDayOfWeek', () => {
  it('maps Monday to 1 and Sunday to 7', () => {
    expect(isoDayOfWeek('2026-09-14')).toBe(1); // Monday
    expect(isoDayOfWeek('2026-09-20')).toBe(7); // Sunday
  });
});

describe('monthly rules — §10 month-end clamping', () => {
  it('keeps the same day in ordinary months', () => {
    const r = rule({ startDate: '2026-01-15' });
    expect([0, 1, 2].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('clamps the 31st to the last valid day', () => {
    const r = rule({ startDate: '2026-01-31' });
    expect([0, 1, 2, 3].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('RETURNS to the 31st after clamping — the drift bug', () => {
    // The classic recurrence failure: clamp Jan 31 to Feb 28, then ask "one
    // month after the 28th?" and get Mar 28. The rule has quietly moved to
    // the 28th and never moves back. Anchoring to the start date prevents it.
    const r = rule({ startDate: '2026-01-31' });
    expect(occurrenceAt(r, 2)).toBe('2026-03-31');
    expect(occurrenceAt(r, 4)).toBe('2026-05-31');
    expect(occurrenceAt(r, 6)).toBe('2026-07-31');
  });

  it('clamps to 29 February in a leap year', () => {
    const r = rule({ startDate: '2024-01-31' });
    expect(occurrenceAt(r, 1)).toBe('2024-02-29');
    expect(occurrenceAt(r, 2)).toBe('2024-03-31');
  });

  it('honours an explicit day_of_month over the start date’s day', () => {
    const r = rule({ startDate: '2026-01-05', dayOfMonth: 28 });
    expect([0, 1].map((s) => occurrenceAt(r, s))).toEqual(['2026-01-28', '2026-02-28']);
  });

  it('crosses a year boundary', () => {
    const r = rule({ startDate: '2026-11-15' });
    expect([0, 1, 2].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-11-15',
      '2026-12-15',
      '2027-01-15',
    ]);
  });

  it('supports every N months — §9', () => {
    const r = rule({ startDate: '2026-01-10', intervalCount: 3 });
    expect([0, 1, 2].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-01-10',
      '2026-04-10',
      '2026-07-10',
    ]);
  });
});

describe('quarterly and yearly', () => {
  it('quarterly steps three months', () => {
    const r = rule({ frequency: 'quarterly', startDate: '2026-01-31' });
    expect([0, 1, 2, 3].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-01-31',
      '2026-04-30',
      '2026-07-31',
      '2026-10-31',
    ]);
  });

  it('yearly holds the date, clamping 29 February', () => {
    const r = rule({ frequency: 'yearly', startDate: '2024-02-29' });
    expect([0, 1, 2, 3, 4].map((s) => occurrenceAt(r, s))).toEqual([
      '2024-02-29',
      '2025-02-28',
      '2026-02-28',
      '2027-02-28',
      '2028-02-29',
    ]);
  });
});

describe('weekly and biweekly — §11', () => {
  it('steps seven days', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-09-14' });
    expect([0, 1, 2].map((s) => occurrenceAt(r, s))).toEqual([
      '2026-09-14',
      '2026-09-21',
      '2026-09-28',
    ]);
  });

  it('biweekly steps fourteen', () => {
    const r = rule({ frequency: 'biweekly', startDate: '2026-09-14' });
    expect([0, 1].map((s) => occurrenceAt(r, s))).toEqual(['2026-09-14', '2026-09-28']);
  });

  it('moves the first occurrence forward to the named weekday', () => {
    // Start Tuesday, want Friday: the first occurrence is that same week.
    const r = rule({ frequency: 'weekly', startDate: '2026-09-15', dayOfWeek: 5 });
    expect(occurrenceAt(r, 0)).toBe('2026-09-18');
    expect(isoDayOfWeek(occurrenceAt(r, 0))).toBe(5);
    expect(isoDayOfWeek(occurrenceAt(r, 3))).toBe(5);
  });

  it('keeps the start date when it already falls on the named weekday', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-09-14', dayOfWeek: 1 });
    expect(occurrenceAt(r, 0)).toBe('2026-09-14');
  });

  it('crosses a month and a year', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-12-28' });
    expect([0, 1].map((s) => occurrenceAt(r, s))).toEqual(['2026-12-28', '2027-01-04']);
  });

  it('every N weeks', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-09-14', intervalCount: 3 });
    expect(occurrenceAt(r, 1)).toBe('2026-10-05');
  });
});

describe('firstOccurrenceOnOrAfter', () => {
  it('returns the start date when asked from before it', () => {
    expect(
      firstOccurrenceOnOrAfter(rule({ startDate: '2026-03-10' }), '2026-01-01'),
    ).toBe('2026-03-10');
  });

  it('skips past occurrences', () => {
    expect(
      firstOccurrenceOnOrAfter(rule({ startDate: '2026-01-15' }), '2026-04-20'),
    ).toBe('2026-05-15');
  });

  it('includes an occurrence falling exactly on the from date', () => {
    expect(
      firstOccurrenceOnOrAfter(rule({ startDate: '2026-01-15' }), '2026-04-15'),
    ).toBe('2026-04-15');
  });

  it('returns null once the rule has ended — §13', () => {
    const r = rule({ startDate: '2026-01-15', endDate: '2026-03-31' });
    expect(firstOccurrenceOnOrAfter(r, '2026-04-01')).toBeNull();
    expect(firstOccurrenceOnOrAfter(r, '2026-03-01')).toBe('2026-03-15');
  });
});

describe('nextOccurrence', () => {
  it('is strictly after the date given', () => {
    expect(nextOccurrence(rule({ startDate: '2026-01-15' }), '2026-01-15')).toBe(
      '2026-02-15',
    );
  });

  it('respects the end date', () => {
    const r = rule({ startDate: '2026-01-15', endDate: '2026-02-28' });
    expect(nextOccurrence(r, '2026-02-15')).toBeNull();
  });

  it('never returns a date before the start', () => {
    const r = rule({ startDate: '2026-06-01' });
    expect(nextOccurrence(r, '2026-01-01')).toBe('2026-06-01');
  });
});

describe('occurrencesBetween', () => {
  it('lists occurrences inside the window, oldest first', () => {
    const r = rule({ startDate: '2026-01-15' });
    expect(occurrencesBetween(r, '2026-02-01', '2026-05-01')).toEqual([
      '2026-02-15',
      '2026-03-15',
      '2026-04-15',
    ]);
  });

  it('includes both boundaries', () => {
    const r = rule({ startDate: '2026-01-15' });
    expect(occurrencesBetween(r, '2026-02-15', '2026-03-15')).toEqual([
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('returns nothing for a reversed window', () => {
    expect(occurrencesBetween(rule(), '2026-05-01', '2026-01-01')).toEqual([]);
  });

  it('stops at the end date', () => {
    const r = rule({ startDate: '2026-01-15', endDate: '2026-03-20' });
    expect(occurrencesBetween(r, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });

  it('covers a 90-day horizon for a weekly rule without running away', () => {
    const r = rule({ frequency: 'weekly', startDate: '2026-09-01' });
    const out = occurrencesBetween(r, '2026-09-01', '2026-11-30');
    expect(out).toHaveLength(13);
    expect(out[0]).toBe('2026-09-01');
  });

  it('respects the cap', () => {
    const r = rule({ frequency: 'weekly', startDate: '2020-01-01' });
    expect(occurrencesBetween(r, '2020-01-01', '2030-01-01', 5)).toHaveLength(5);
  });

  it('produces strictly increasing, unique dates', () => {
    for (const f of ['weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'] as const) {
      const out = occurrencesBetween(
        rule({ frequency: f, startDate: '2024-01-31' }),
        '2024-01-01',
        '2030-01-01',
      );
      for (let i = 1; i < out.length; i += 1) {
        expect(out[i]! > out[i - 1]!).toBe(true);
      }
      expect(new Set(out).size).toBe(out.length);
    }
  });

  it('is unaffected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      const r = rule({ startDate: '2026-01-31' });
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
        process.env.TZ = tz;
        expect(occurrencesBetween(r, '2026-01-01', '2026-04-30')).toEqual([
          '2026-01-31',
          '2026-02-28',
          '2026-03-31',
          '2026-04-30',
        ]);
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('describeRule', () => {
  it('reads naturally for every frequency', () => {
    expect(describeRule(rule({ frequency: 'monthly' }))).toBe('Monthly');
    expect(describeRule(rule({ frequency: 'monthly', intervalCount: 2 }))).toBe(
      'Every 2 months',
    );
    expect(describeRule(rule({ frequency: 'weekly' }))).toBe('Weekly');
    expect(describeRule(rule({ frequency: 'biweekly' }))).toBe('Every 2 weeks');
    expect(describeRule(rule({ frequency: 'quarterly' }))).toBe('Quarterly');
    expect(describeRule(rule({ frequency: 'yearly' }))).toBe('Yearly');
  });
});

describe('initialCursor — where a new rule starts generating', () => {
  const monthly31 = {
    frequency: 'monthly' as const,
    intervalCount: 1,
    startDate: '2026-01-31',
    dayOfMonth: 31,
  };

  it('does not backfill a rule whose start date is in the past', () => {
    // The regression this exists for: seeding the cursor at the start date
    // made a January rule created in September generate eight back-dated
    // bills, each of them counted as overdue. Verified against a real
    // database before the fix.
    expect(initialCursor(monthly31, '2026-09-14')).toBe('2026-09-30');
  });

  it('still honours a start date in the future', () => {
    expect(initialCursor(monthly31, '2025-06-01')).toBe('2026-01-31');
  });

  it('keeps the start date as the anchor, so month-end still clamps', () => {
    // Sep clamps to 30, Oct keeps 31 — the anchor rule survives the change.
    const first = initialCursor(monthly31, '2026-09-14');
    expect(first).toBe('2026-09-30');
    expect(nextOccurrence(monthly31, first!)).toBe('2026-10-31');
  });

  it('returns today itself when an occurrence falls on it', () => {
    expect(initialCursor(monthly31, '2026-09-30')).toBe('2026-09-30');
  });

  it('returns null when the rule has already ended', () => {
    expect(
      initialCursor({ ...monthly31, endDate: '2026-06-30' }, '2026-09-14'),
    ).toBeNull();
  });

  it('works for weekly rules', () => {
    const weekly = {
      frequency: 'weekly' as const,
      intervalCount: 1,
      startDate: '2026-01-05',
    };
    const cursor = initialCursor(weekly, '2026-09-14');
    expect(cursor).not.toBeNull();
    expect(cursor! >= '2026-09-14').toBe(true);
    // Still on the rule's own weekday, not shifted to "today".
    expect(isoDayOfWeek(cursor!)).toBe(isoDayOfWeek('2026-01-05'));
  });
});
