import { describe, expect, it } from 'vitest';
import { monthsInRange, rangeFor, startOfMonth, type RangePreset } from './range';

const TODAY = '2026-09-13';

describe('startOfMonth', () => {
  it('returns the first of the month', () => {
    expect(startOfMonth('2026-09-13')).toBe('2026-09-01');
    expect(startOfMonth('2026-01-31')).toBe('2026-01-01');
  });
});

describe('rangeFor — §25 presets', () => {
  it('this month spans the whole calendar month', () => {
    const r = rangeFor('this-month', TODAY);
    // The whole month, not month-to-date: a confirmed transaction dated later
    // this month has already moved the balance shown beside it.
    expect(r).toMatchObject({ from: '2026-09-01', to: '2026-09-30' });
  });

  it('last month spans the previous calendar month', () => {
    expect(rangeFor('last-month', TODAY)).toMatchObject({
      from: '2026-08-01',
      to: '2026-08-31',
    });
  });

  it('last month crosses a year boundary', () => {
    expect(rangeFor('last-month', '2026-01-15')).toMatchObject({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });

  it('3m and 6m include the current month', () => {
    expect(rangeFor('3m', TODAY)).toMatchObject({ from: '2026-07-01', to: '2026-09-30' });
    expect(rangeFor('6m', TODAY)).toMatchObject({ from: '2026-04-01', to: '2026-09-30' });
  });

  it('this year runs from January to the end of the current month', () => {
    // Not 31 December: the trend would draw three empty future columns, which
    // reads as "you earned nothing in November".
    expect(rangeFor('this-year', TODAY)).toMatchObject({
      from: '2026-01-01',
      to: '2026-09-30',
    });
    expect(monthsInRange(rangeFor('this-year', TODAY)).months).toHaveLength(9);
  });

  it('handles a leap February at the end of a range', () => {
    expect(rangeFor('this-month', '2024-02-05')).toMatchObject({
      from: '2024-02-01',
      to: '2024-02-29',
    });
  });

  it('is unaffected by the process timezone', () => {
    const original = process.env.TZ;
    try {
      for (const tz of ['Pacific/Kiritimati', 'Pacific/Midway', 'UTC']) {
        process.env.TZ = tz;
        expect(rangeFor('last-month', '2026-01-01').from).toBe('2025-12-01');
        expect(rangeFor('this-month', '2026-03-31').to).toBe('2026-03-31');
      }
    } finally {
      process.env.TZ = original;
    }
  });

  it('labels every preset', () => {
    for (const p of [
      'this-month',
      'last-month',
      '3m',
      '6m',
      'this-year',
    ] as RangePreset[]) {
      expect(rangeFor(p, TODAY).label.length).toBeGreaterThan(0);
    }
  });
});

describe('rangeFor — custom range, §25 and §65', () => {
  it('uses the dates given', () => {
    expect(
      rangeFor('custom', TODAY, { from: '2026-03-01', to: '2026-05-31' }),
    ).toMatchObject({ from: '2026-03-01', to: '2026-05-31', swapped: false });
  });

  it('swaps a reversed range and flags it rather than dead-ending', () => {
    // §65 says reject "end before start". A URL is not a form, so the invalid
    // ordering is refused by correcting it, and the page says so.
    const r = rangeFor('custom', TODAY, { from: '2026-05-31', to: '2026-03-01' });
    expect(r.from).toBe('2026-03-01');
    expect(r.to).toBe('2026-05-31');
    expect(r.swapped).toBe(true);
  });

  it('never produces an inverted range', () => {
    for (const [a, b] of [
      ['2026-01-01', '2026-01-01'],
      ['2026-12-31', '2026-01-01'],
      ['2026-06-15', '2026-06-14'],
    ]) {
      const r = rangeFor('custom', TODAY, { from: a, to: b });
      expect(r.from <= r.to).toBe(true);
    }
  });

  it('fills a missing half relative to the half that was given', () => {
    // A lone `from` means "since then".
    expect(rangeFor('custom', TODAY, { from: '2026-03-01' })).toMatchObject({
      from: '2026-03-01',
      to: '2026-09-30',
      swapped: false,
    });
    // A lone `to` means "the month ending there" — not "from this month back
    // to then", which would be an eight-month range from one typed date, and
    // reversed at that.
    expect(rangeFor('custom', TODAY, { to: '2026-01-31' })).toMatchObject({
      from: '2026-01-01',
      to: '2026-01-31',
      swapped: false,
    });
    expect(rangeFor('custom', TODAY, {})).toMatchObject({
      from: '2026-09-01',
      to: '2026-09-30',
    });
  });

  it('clamps an absurdly long range rather than asking for 60,000 rows', () => {
    const r = rangeFor('custom', TODAY, { from: '1900-01-01', to: '2026-09-30' });
    expect(r.clamped).toBe(true);
    expect(r.from).toBe('2021-09-30');
    expect(
      rangeFor('custom', TODAY, { from: '2024-01-01', to: '2026-09-30' }).clamped,
    ).toBe(false);
  });

  it('accepts a single-day range', () => {
    const r = rangeFor('custom', TODAY, { from: '2026-04-10', to: '2026-04-10' });
    expect(r.from).toBe(r.to);
    expect(r.swapped).toBe(false);
  });
});

describe('monthsInRange', () => {
  it('lists every month the range touches, oldest first', () => {
    expect(monthsInRange({ from: '2026-07-01', to: '2026-09-30' })).toEqual({
      months: ['2026-07', '2026-08', '2026-09'],
      truncated: false,
    });
  });

  it('includes a month the range only partly covers', () => {
    expect(monthsInRange({ from: '2026-07-28', to: '2026-08-02' }).months).toEqual([
      '2026-07',
      '2026-08',
    ]);
  });

  it('returns one month for a range inside a single month', () => {
    expect(monthsInRange({ from: '2026-09-05', to: '2026-09-06' }).months).toEqual([
      '2026-09',
    ]);
  });

  it('crosses a year boundary', () => {
    expect(monthsInRange({ from: '2025-11-01', to: '2026-01-31' }).months).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
    ]);
  });

  it('caps a very long range and says that it did', () => {
    // A decade would be 144 unreadable columns — but the page must not claim
    // to be showing the whole range while plotting part of it.
    const out = monthsInRange({ from: '2015-01-01', to: '2026-12-31' });
    expect(out.months).toHaveLength(24);
    expect(out.months.at(-1)).toBe('2026-12');
    expect(out.truncated).toBe(true);
  });

  it('respects an explicit cap', () => {
    expect(monthsInRange({ from: '2026-01-01', to: '2026-12-31' }, 3).months).toEqual([
      '2026-10',
      '2026-11',
      '2026-12',
    ]);
  });
});
