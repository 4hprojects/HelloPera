import { describe, expect, it } from 'vitest';
import { ANALYTICS_EVENTS, sanitise } from '@/lib/telemetry/events';

describe('sanitise — §52, criterion 24', () => {
  it('keeps the allowed public keys', () => {
    expect(sanitise({ path: '/guides', slug: 'a-guide', category: 'Planning' })).toEqual({
      path: '/guides',
      slug: 'a-guide',
      category: 'Planning',
    });
  });

  it('drops every key §52 forbids', () => {
    // The rule this module exists to enforce. Each of these is named in §52.
    const forbidden = {
      balance: 12345,
      amount: 500,
      transactionAmount: '1,799.00',
      billValue: 2845,
      receivableValue: 800,
      accountNumber: '1234-5678',
      ocrText: 'RECEIPT TOTAL 1,799.00',
      merchant: 'SM Supermarket',
      email: 'someone@example.com',
      userId: 'uuid-here',
    };

    expect(sanitise(forbidden)).toEqual({});
  });

  it('drops a forbidden value even when it is a string', () => {
    // Coercing an amount to a string still sends the amount.
    expect(sanitise({ amount: '1799.00' })).toEqual({});
  });

  it('drops a number on an allowed key', () => {
    // No event property is numeric, because every value §52 forbids is one.
    expect(sanitise({ path: 1234 })).toEqual({});
  });

  it('drops nested objects entirely', () => {
    // The shape most likely to smuggle a balance through.
    expect(sanitise({ path: '/x', extra: { balance: 999 } })).toEqual({ path: '/x' });
  });

  it('keeps an allowed key alongside a forbidden one', () => {
    expect(sanitise({ path: '/pricing', balance: 999 })).toEqual({ path: '/pricing' });
  });
});

describe('event vocabulary — §52', () => {
  it('names only public-site actions', () => {
    // Nothing here describes a financial action. If an event name ever
    // implies one, the analytics surface has crossed into the app.
    for (const event of ANALYTICS_EVENTS) {
      expect(event, event).not.toMatch(
        /transaction|balance|amount|bill|receivable|account_|document|ocr/,
      );
    }
  });

  it('has no duplicates', () => {
    expect(new Set(ANALYTICS_EVENTS).size).toBe(ANALYTICS_EVENTS.length);
  });
});
