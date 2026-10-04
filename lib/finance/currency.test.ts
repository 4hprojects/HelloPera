import { describe, expect, it } from 'vitest';
import { deriveTransactionCurrency, todayInTimezone } from '@/lib/finance/currency';

const php = { id: 'a', currency: 'PHP' };
const usd = { id: 'b', currency: 'USD' };
const usd2 = { id: 'c', currency: 'USD' };

describe('deriveTransactionCurrency', () => {
  it('uses the account currency, not a profile default', () => {
    expect(deriveTransactionCurrency(usd, null)).toEqual({ ok: true, currency: 'USD' });
    expect(deriveTransactionCurrency(null, usd)).toEqual({ ok: true, currency: 'USD' });
  });
  it('allows same-currency transfers', () => {
    expect(deriveTransactionCurrency(usd, usd2)).toEqual({ ok: true, currency: 'USD' });
  });
  it('refuses cross-currency transfers clearly', () => {
    const result = deriveTransactionCurrency(php, usd);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/PHP cannot move to a USD/);
  });
  it('refuses a transfer to the same account', () => {
    expect(deriveTransactionCurrency(php, php).ok).toBe(false);
  });
  it('requires an account', () => {
    expect(deriveTransactionCurrency(null, null).ok).toBe(false);
  });
});

describe('todayInTimezone', () => {
  it('uses the local calendar date around local midnight', () => {
    // 2026-10-04T17:00Z is already 5 Oct 01:00 in Manila, still 4 Oct in UTC.
    const now = new Date('2026-10-04T17:00:00Z');
    expect(todayInTimezone('Asia/Manila', now)).toBe('2026-10-05');
    expect(todayInTimezone('UTC', now)).toBe('2026-10-04');
    expect(todayInTimezone('America/Los_Angeles', now)).toBe('2026-10-04');
  });
  it('falls back to UTC for an unknown zone', () => {
    expect(todayInTimezone('Nope/Zone', new Date('2026-10-04T17:00:00Z'))).toBe(
      '2026-10-04',
    );
  });
});
