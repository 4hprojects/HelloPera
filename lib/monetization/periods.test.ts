import { describe, expect, it } from 'vitest';
import {
  currentPeriod,
  periodForDate,
  resetsOn,
  resolvePeriod,
} from '@/lib/monetization/periods';

describe('periodForDate — §16', () => {
  it('spans the whole calendar month', () => {
    expect(periodForDate('2026-09-14')).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
    expect(periodForDate('2026-01-01')).toEqual({
      start: '2026-01-01',
      end: '2026-01-31',
    });
    expect(periodForDate('2026-12-31')).toEqual({
      start: '2026-12-01',
      end: '2026-12-31',
    });
  });

  it('handles February in and out of leap years', () => {
    expect(periodForDate('2024-02-15').end).toBe('2024-02-29');
    expect(periodForDate('2026-02-15').end).toBe('2026-02-28');
    expect(periodForDate('2000-02-01').end).toBe('2000-02-29');
    expect(periodForDate('1900-02-01').end).toBe('1900-02-28');
  });

  it('is stable for every day within one month', () => {
    const first = periodForDate('2026-09-01');
    for (const d of ['2026-09-02', '2026-09-15', '2026-09-30']) {
      expect(periodForDate(d)).toEqual(first);
    }
  });
});

describe('currentPeriod — the user timezone, not the server (§16)', () => {
  it('uses the user zone to decide which month it is', () => {
    // 2026-10-01 00:30 in Manila is still 2026-09-30 in UTC. A server-side
    // month boundary would put this usage in the wrong period, and the user
    // would see their quota reset a day late.
    const instant = new Date('2026-09-30T16:30:00Z');
    expect(currentPeriod('Asia/Manila', instant).start).toBe('2026-10-01');
    expect(currentPeriod('UTC', instant).start).toBe('2026-09-01');
  });

  it('is unaffected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      const instant = new Date('2026-09-14T12:00:00Z');
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
        process.env.TZ = tz;
        expect(currentPeriod('Asia/Manila', instant).start).toBe('2026-09-01');
      }
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('resolvePeriod — a timezone change mid-period (§18)', () => {
  const instant = new Date('2026-09-14T12:00:00Z');

  it('keeps an existing period that still contains today', () => {
    // §18: recomputing a period already charged against would change a number
    // the user has seen. "18 / 30" becoming "17 / 30" after a settings change
    // is a bug report, and a justifiable one.
    const existing = { start: '2026-09-01', end: '2026-09-30' };
    expect(resolvePeriod('Asia/Manila', existing, instant)).toEqual(existing);
    expect(resolvePeriod('UTC', existing, instant)).toEqual(existing);
    expect(resolvePeriod('Pacific/Midway', existing, instant)).toEqual(existing);
  });

  it('starts a fresh period once the old one has passed', () => {
    const stale = { start: '2026-08-01', end: '2026-08-31' };
    expect(resolvePeriod('Asia/Manila', stale, instant)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });

  it('starts a fresh period when there is none', () => {
    expect(resolvePeriod('Asia/Manila', null, instant)).toEqual({
      start: '2026-09-01',
      end: '2026-09-30',
    });
  });
});

describe('resetsOn — the §33 copy', () => {
  it('is the first day of the next month', () => {
    expect(resetsOn({ start: '2026-09-01', end: '2026-09-30' })).toBe('2026-10-01');
    expect(resetsOn({ start: '2026-02-01', end: '2026-02-28' })).toBe('2026-03-01');
  });

  it('rolls over the year', () => {
    expect(resetsOn({ start: '2026-12-01', end: '2026-12-31' })).toBe('2027-01-01');
  });
});
