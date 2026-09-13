import { describe, expect, it } from 'vitest';
import {
  add,
  compare,
  formatMoney,
  fromDatabase,
  isNegative,
  money,
  MoneyError,
  parseDecimal,
  parseMoney,
  subtract,
  sum,
  toDatabase,
  toDecimalString,
  zero,
  sumByCurrency,
} from '@/lib/money';

describe('parseDecimal', () => {
  it('parses plain decimals to minor units', () => {
    expect(parseDecimal('1234.56')).toBe(123456n);
    expect(parseDecimal('0.01')).toBe(1n);
    expect(parseDecimal('0')).toBe(0n);
    expect(parseDecimal('100')).toBe(10000n);
  });

  it('accepts the formats people actually type', () => {
    expect(parseDecimal('1,234.56')).toBe(123456n);
    expect(parseDecimal('₱1,234.56')).toBe(123456n);
    expect(parseDecimal('  1234.5  ')).toBe(123450n);
    expect(parseDecimal('.5')).toBe(50n);
  });

  it('handles negatives', () => {
    expect(parseDecimal('-12.30')).toBe(-1230n);
    expect(parseDecimal('-0.01')).toBe(-1n);
  });

  it('rejects more precision than the scale allows rather than rounding', () => {
    // Silently truncating a third decimal is how a ledger stops reconciling.
    expect(() => parseDecimal('1.005')).toThrow(MoneyError);
    expect(() => parseDecimal('0.999')).toThrow(MoneyError);
  });

  it('rejects junk', () => {
    expect(() => parseDecimal('')).toThrow(MoneyError);
    expect(() => parseDecimal('abc')).toThrow(MoneyError);
    expect(() => parseDecimal('1.2.3')).toThrow(MoneyError);
    expect(() => parseDecimal('-')).toThrow(MoneyError);
  });
});

describe('exactness — the reason this module exists', () => {
  it('0.1 + 0.2 is exactly 0.3, which floats get wrong', () => {
    expect(0.1 + 0.2).not.toBe(0.3); // the bug we are avoiding
    const result = add(parseMoney('0.1', 'PHP'), parseMoney('0.2', 'PHP'));
    expect(toDecimalString(result.minor)).toBe('0.30');
  });

  it('survives ten thousand one-centavo additions with no drift', () => {
    let total = zero('PHP');
    for (let i = 0; i < 10_000; i += 1) {
      total = add(total, parseMoney('0.01', 'PHP'));
    }
    expect(toDecimalString(total.minor)).toBe('100.00');
  });

  it('stays exact past Number.MAX_SAFE_INTEGER in minor units', () => {
    // numeric(18,2) reaches this range. Above 2^53 the doubles run out of
    // integers: 9007199254740993 has no representation and collapses onto
    // 9007199254740992, so a number-based ledger would lose a centavo here
    // and never be able to explain the discrepancy.
    const a = money(9_007_199_254_740_992n, 'PHP');
    const b = add(a, money(1n, 'PHP'));

    expect(b.minor).toBe(9_007_199_254_740_993n);
    expect(a.minor === b.minor).toBe(false); // bigint keeps them distinct
    expect(Number(a.minor) === Number(b.minor)).toBe(true); // doubles collide
  });
});

describe('currency safety', () => {
  it('refuses to add different currencies', () => {
    expect(() => add(parseMoney('100', 'PHP'), parseMoney('100', 'USD'))).toThrow(
      MoneyError,
    );
  });

  it('says why, rather than producing a fabricated total', () => {
    expect(() => add(zero('PHP'), zero('USD'))).toThrow(/does not convert/i);
  });

  it('refuses to compare across currencies', () => {
    expect(() => compare(zero('PHP'), zero('USD'))).toThrow(MoneyError);
  });
});

describe('database round-trip', () => {
  it('survives string -> Money -> string unchanged', () => {
    for (const raw of ['0.00', '1234.56', '-99.99', '1000000.01']) {
      expect(toDatabase(fromDatabase(raw, 'PHP'))).toBe(raw);
    }
  });

  it('never serialises as a JS number', () => {
    expect(typeof toDatabase(parseMoney('1234.56', 'PHP'))).toBe('string');
  });

  it('treats null as zero', () => {
    expect(fromDatabase(null, 'PHP').minor).toBe(0n);
  });
});

describe('arithmetic', () => {
  it('subtracts and sums', () => {
    const a = parseMoney('100.00', 'PHP');
    const b = parseMoney('30.50', 'PHP');
    expect(toDecimalString(subtract(a, b).minor)).toBe('69.50');
    expect(toDecimalString(sum([a, b], 'PHP').minor)).toBe('130.50');
  });

  it('sums an empty list to zero', () => {
    expect(sum([], 'PHP').minor).toBe(0n);
  });

  it('detects negatives', () => {
    expect(isNegative(parseMoney('-0.01', 'PHP'))).toBe(true);
    expect(isNegative(zero('PHP'))).toBe(false);
  });
});

describe('formatMoney', () => {
  it('groups thousands and always shows the currency', () => {
    expect(formatMoney(parseMoney('1234567.89', 'PHP'))).toBe('₱1,234,567.89');
    expect(formatMoney(parseMoney('0', 'PHP'))).toBe('₱0.00');
  });

  it('places the minus before the symbol', () => {
    expect(formatMoney(parseMoney('-1234.56', 'PHP'))).toBe('-₱1,234.56');
  });

  it('can show an explicit plus for income', () => {
    expect(formatMoney(parseMoney('500', 'PHP'), { showSign: true })).toBe('+₱500.00');
    expect(formatMoney(zero('PHP'), { showSign: true })).toBe('₱0.00');
  });

  it('falls back to the code for unknown currencies', () => {
    expect(formatMoney(parseMoney('10', 'AUD'))).toBe('AUD 10.00');
  });
});

describe('sumByCurrency', () => {
  it('groups instead of throwing on a mixed list', () => {
    const out = sumByCurrency([
      money(1_000n, 'PHP'),
      money(250n, 'USD'),
      money(500n, 'PHP'),
    ]);
    expect(out).toEqual([
      { minor: 1_500n, currency: 'PHP' },
      { minor: 250n, currency: 'USD' },
    ]);
  });

  it('puts the preferred currency first', () => {
    const out = sumByCurrency(
      [money(1n, 'USD'), money(1n, 'AUD'), money(1n, 'PHP')],
      'PHP',
    );
    expect(out.map((m) => m.currency)).toEqual(['PHP', 'AUD', 'USD']);
  });

  it('emits the preferred currency even when nothing is in it', () => {
    expect(sumByCurrency([], 'PHP')).toEqual([{ minor: 0n, currency: 'PHP' }]);
  });

  it('returns nothing for an empty list with no preference', () => {
    expect(sumByCurrency([])).toEqual([]);
  });

  it('never silently adds across currencies — the bug it exists to prevent', () => {
    const out = sumByCurrency([money(100n, 'PHP'), money(100n, 'USD')]);
    expect(out).toHaveLength(2);
    expect(out.every((m) => m.minor === 100n)).toBe(true);
  });
});
