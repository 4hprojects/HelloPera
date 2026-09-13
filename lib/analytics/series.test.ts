import { describe, expect, it } from 'vitest';
import {
  collapseTail,
  greetingFor,
  monthLabel,
  monthWindow,
  endOfMonth,
  niceTicks,
  percentChange,
  percentChangeMinor,
  rotate,
  signedDomain,
  toChartValues,
} from './series';

describe('monthWindow', () => {
  it('returns the requested count, oldest first, ending at today’s month', () => {
    expect(monthWindow('2026-09-13', 4)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
    ]);
  });

  it('crosses the year boundary backwards', () => {
    expect(monthWindow('2026-02-01', 4)).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ]);
  });

  it('does not skip a month when today is the 31st', () => {
    // Naive month arithmetic on a Date set to the 31st lands on the 1st or
    // 2nd of the month after — March 31 minus one month is not April.
    expect(monthWindow('2026-03-31', 3)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(monthWindow('2026-05-31', 2)).toEqual(['2026-04', '2026-05']);
  });

  it('is not affected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      // A UTC-13 offset would roll 2026-01-01T00:00Z back into December.
      process.env.TZ = 'Pacific/Kiritimati';
      expect(monthWindow('2026-01-01', 2)).toEqual(['2025-12', '2026-01']);
    } finally {
      process.env.TZ = original;
    }
  });

  it('returns a single month for count 1', () => {
    expect(monthWindow('2026-09-13', 1)).toEqual(['2026-09']);
  });
});

describe('monthLabel', () => {
  it('renders the short month name', () => {
    expect(monthLabel('2026-01')).toBe('Jan');
    expect(monthLabel('2026-12')).toBe('Dec');
  });
});

describe('percentChange', () => {
  it('computes a rise and a fall', () => {
    expect(percentChange(125, 100)).toBeCloseTo(25);
    expect(percentChange(92, 100)).toBeCloseTo(-8);
  });

  it('returns null rather than infinity when the base is zero', () => {
    expect(percentChange(5000, 0)).toBeNull();
  });

  it('returns null when there is no previous month', () => {
    expect(percentChange(5000, null)).toBeNull();
  });

  it('is zero when nothing changed', () => {
    expect(percentChange(100, 100)).toBe(0);
  });
});

describe('niceTicks', () => {
  it('rounds the axis top to a readable step', () => {
    expect(niceTicks(47_000, 4)).toEqual([20_000, 40_000, 60_000]);
  });

  it('always produces at least one tick for an empty chart', () => {
    expect(niceTicks(0, 4).length).toBeGreaterThan(0);
  });

  it('covers the maximum value', () => {
    for (const max of [1, 9, 99, 1234, 987_654]) {
      expect(niceTicks(max, 4).at(-1)!).toBeGreaterThanOrEqual(max);
    }
  });

  it('produces strictly increasing ticks', () => {
    const ticks = niceTicks(123_456, 5);
    for (let i = 1; i < ticks.length; i += 1) {
      expect(ticks[i]!).toBeGreaterThan(ticks[i - 1]!);
    }
  });
});

describe('greetingFor', () => {
  it('splits the day at noon and six', () => {
    expect(greetingFor(0)).toBe('Good morning');
    expect(greetingFor(11)).toBe('Good morning');
    expect(greetingFor(12)).toBe('Good afternoon');
    expect(greetingFor(17)).toBe('Good afternoon');
    expect(greetingFor(18)).toBe('Good evening');
    expect(greetingFor(23)).toBe('Good evening');
  });
});

describe('rotate', () => {
  const items = ['a', 'b', 'c'] as const;

  it('is stable for the same date', () => {
    expect(rotate(items, '2026-09-13')).toBe(rotate(items, '2026-09-13'));
  });

  it('changes across days', () => {
    const week = ['13', '14', '15', '16', '17', '18', '19'].map((d) =>
      rotate(items, `2026-09-${d}`),
    );
    expect(new Set(week).size).toBeGreaterThan(1);
  });

  it('always returns a member of the list', () => {
    for (let d = 1; d <= 28; d += 1) {
      const picked = rotate(items, `2026-02-${String(d).padStart(2, '0')}`);
      expect(items).toContain(picked);
    }
  });

  it('refuses an empty list rather than returning undefined', () => {
    expect(() => rotate([], '2026-09-13')).toThrow();
  });
});

describe('collapseTail', () => {
  const other = (value: number) => ({ label: 'Others', value });
  const slices = [5, 4, 3, 2, 1].map((value, i) => ({ label: `c${i}`, value }));

  it('leaves a short list alone', () => {
    expect(collapseTail(slices, 5, other)).toHaveLength(5);
    expect(collapseTail(slices, 4, other)).toHaveLength(5);
  });

  it('rolls the tail into one row and conserves the total', () => {
    const out = collapseTail(slices, 2, other);
    expect(out.map((s) => s.label)).toEqual(['c0', 'c1', 'Others']);
    expect(out.reduce((s, x) => s + x.value, 0)).toBe(15);
  });

  it('drops an empty tail rather than showing a zero row', () => {
    const withZeros = [
      { label: 'a', value: 5 },
      { label: 'b', value: 0 },
      { label: 'c', value: 0 },
      { label: 'd', value: 0 },
    ];
    expect(collapseTail(withZeros, 1, other)).toEqual([{ label: 'a', value: 5 }]);
  });
});

describe('endOfMonth', () => {
  it('returns the last day of the month', () => {
    expect(endOfMonth('2026-02-13')).toBe('2026-02-28');
    expect(endOfMonth('2026-12-05')).toBe('2026-12-31');
    expect(endOfMonth('2026-04-01')).toBe('2026-04-30');
  });

  it('handles a leap February', () => {
    expect(endOfMonth('2024-02-01')).toBe('2024-02-29');
  });

  it('is idempotent on a date already at month end', () => {
    expect(endOfMonth('2026-04-30')).toBe('2026-04-30');
  });

  it('is not affected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      expect(endOfMonth('2026-01-01')).toBe('2026-01-31');
      process.env.TZ = 'Pacific/Midway';
      expect(endOfMonth('2026-01-01')).toBe('2026-01-31');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('signedDomain', () => {
  it('leaves an all-positive series anchored at zero', () => {
    const d = signedDomain([10, 40, 25], 4);
    expect(d.bottom).toBe(0);
    expect(d.top).toBeGreaterThanOrEqual(40);
    expect(d.ticks).toContain(0);
  });

  it('opens the axis below zero when a value is negative', () => {
    const d = signedDomain([40, -8, 25], 4);
    expect(d.bottom).toBeLessThan(0);
    expect(d.bottom).toBeLessThanOrEqual(-8);
    expect(d.top).toBeGreaterThanOrEqual(40);
  });

  it('always includes zero, so the baseline can be drawn', () => {
    for (const vals of [[5, 3], [-5, -3], [0], [], [-1, 1]]) {
      expect(signedDomain(vals, 4).ticks).toContain(0);
    }
  });

  it('caps an all-negative series at zero', () => {
    expect(signedDomain([-5, -30], 4).top).toBe(0);
  });

  it('produces strictly increasing ticks covering the range', () => {
    const d = signedDomain([-1200, 4300, 900], 4);
    for (let i = 1; i < d.ticks.length; i += 1) {
      expect(d.ticks[i]!).toBeGreaterThan(d.ticks[i - 1]!);
    }
    expect(d.ticks[0]!).toBeLessThanOrEqual(d.bottom);
    expect(d.ticks.at(-1)!).toBeGreaterThanOrEqual(d.top);
  });
});

describe('toChartValues', () => {
  it('converts minor units to numbers, preserving sign and order', () => {
    expect(toChartValues([100n, -250n, 0n])).toEqual([100, -250, 0]);
    expect(toChartValues([])).toEqual([]);
  });
});

describe('percentChangeMinor', () => {
  it('matches the float version for ordinary cases', () => {
    expect(percentChangeMinor(125n, 100n)).toBeCloseTo(25);
    expect(percentChangeMinor(92n, 100n)).toBeCloseTo(-8);
    expect(percentChangeMinor(100n, 100n)).toBe(0);
  });

  it('returns null when there is nothing to compare against', () => {
    expect(percentChangeMinor(5000n, 0n)).toBeNull();
    expect(percentChangeMinor(5000n, null)).toBeNull();
  });

  it('reports direction correctly when the base is negative', () => {
    // From −₱100 to +₱50 is an improvement, so the change is positive.
    expect(percentChangeMinor(50n, -100n)).toBeCloseTo(150);
  });
});
