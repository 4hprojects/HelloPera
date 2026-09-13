import { describe, expect, it } from 'vitest';
import {
  analyticsHref,
  parseAnalyticsParams,
  parseDashboardParams,
} from './analytics.schema';

describe('parseDashboardParams', () => {
  it('accepts the three windows and falls back on anything else', () => {
    expect(parseDashboardParams({ trend: '3' }).trend).toBe(3);
    expect(parseDashboardParams({ trend: '12' }).trend).toBe(12);
    for (const bad of ['999', 'abc', '', '-1']) {
      expect(parseDashboardParams({ trend: bad }).trend).toBe(6);
    }
    expect(parseDashboardParams({}).trend).toBe(6);
  });
});

describe('parseAnalyticsParams — §65', () => {
  it('defaults to this month with no filters', () => {
    expect(parseAnalyticsParams({})).toEqual({ range: 'this-month', dropped: [] });
  });

  it('names the parameters it had to ignore', () => {
    // A malformed filter that is silently dropped renders identically to no
    // filter at all, which reads as "the filter is broken".
    const out = parseAnalyticsParams({ accountId: '333-not-a-uuid', type: 'expense' });
    expect(out.dropped).toEqual(['accountId']);
    expect(out.type).toBe('expense');
  });

  it('reports nothing when every supplied value was usable', () => {
    expect(parseAnalyticsParams({ range: '6m', type: 'income' }).dropped).toEqual([]);
  });

  it('accepts every valid preset', () => {
    for (const r of ['this-month', 'last-month', '3m', '6m', 'this-year', 'custom']) {
      expect(parseAnalyticsParams({ range: r }).range).toBe(r);
    }
  });

  it('falls back rather than erroring on a bad preset', () => {
    expect(parseAnalyticsParams({ range: 'last-decade' }).range).toBe('this-month');
  });

  it('drops a malformed date instead of failing the whole query', () => {
    const out = parseAnalyticsParams({ range: 'custom', from: '13/05/2026', to: 'x' });
    expect(out.range).toBe('custom');
    expect(out.from).toBeUndefined();
    expect(out.to).toBeUndefined();
  });

  it('rejects a date that matches the shape but is not a real day', () => {
    // Date.parse accepts these — it rolls 2026-02-31 forward to March 3rd.
    expect(parseAnalyticsParams({ from: '2026-02-31' }).from).toBeUndefined();
    expect(parseAnalyticsParams({ from: '2026-13-01' }).from).toBeUndefined();
    expect(parseAnalyticsParams({ from: '2025-02-29' }).from).toBeUndefined();
    expect(parseAnalyticsParams({ from: '2024-02-29' }).from).toBe('2024-02-29');
  });

  it('upper-cases a currency and drops one of the wrong length', () => {
    expect(parseAnalyticsParams({ currency: 'php' }).currency).toBe('PHP');
    expect(parseAnalyticsParams({ currency: 'PESO' }).currency).toBeUndefined();
    expect(parseAnalyticsParams({ currency: '' }).currency).toBeUndefined();
  });

  it('drops ids that are not uuids', () => {
    expect(parseAnalyticsParams({ accountId: 'bpi' }).accountId).toBeUndefined();
    expect(parseAnalyticsParams({ categoryId: '123' }).categoryId).toBeUndefined();
    const real = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    expect(parseAnalyticsParams({ accountId: real }).accountId).toBe(real);
  });

  it('drops a transaction type that is not one of ours', () => {
    expect(parseAnalyticsParams({ type: 'expense' }).type).toBe('expense');
    expect(parseAnalyticsParams({ type: 'withdrawal' }).type).toBeUndefined();
  });

  it('keeps the good filters when one is bad', () => {
    // Refusing the whole query string over one stale id would throw away the
    // rest of what the user asked for.
    const out = parseAnalyticsParams({
      range: '6m',
      currency: 'PHP',
      accountId: 'not-a-uuid',
      type: 'expense',
    });
    expect(out).toMatchObject({ range: '6m', currency: 'PHP', type: 'expense' });
    expect(out.accountId).toBeUndefined();
    expect(out.dropped).toEqual(['accountId']);
  });
});

describe('analyticsHref — §58', () => {
  it('returns a bare path for the defaults', () => {
    expect(analyticsHref({ range: 'this-month' }, {})).toBe('/analytics');
  });

  it('preserves other filters when one changes', () => {
    const href = analyticsHref(
      { range: '6m', currency: 'PHP', type: 'expense' },
      { range: '3m' },
    );
    expect(href).toContain('range=3m');
    expect(href).toContain('currency=PHP');
    expect(href).toContain('type=expense');
  });

  it('carries custom dates only for a custom range', () => {
    expect(
      analyticsHref({ range: 'custom', from: '2026-01-01', to: '2026-03-31' }, {}),
    ).toContain('from=2026-01-01');
    // Switching to a preset drops the now-meaningless dates.
    expect(
      analyticsHref(
        { range: 'custom', from: '2026-01-01', to: '2026-03-31' },
        { range: '6m' },
      ),
    ).not.toContain('from=');
  });

  it('can clear a filter', () => {
    expect(analyticsHref({ range: '6m', type: 'expense' }, { type: undefined })).toBe(
      '/analytics?range=6m',
    );
  });

  it('round-trips through the parser', () => {
    const original = {
      range: '3m' as const,
      currency: 'PHP',
      accountId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      type: 'expense' as const,
    };
    const href = analyticsHref(original, {});
    const query = Object.fromEntries(new URLSearchParams(href.split('?')[1] ?? ''));
    expect(parseAnalyticsParams(query)).toMatchObject(original);
  });
});
