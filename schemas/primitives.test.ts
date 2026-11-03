import { describe, expect, it } from 'vitest';
import { isoDate, positiveAmount, signedAmount } from './primitives';

/**
 * HP-004. The money and date primitives every form schema is built from, at
 * the edges a person or a script actually reaches. The canonical output is
 * what the database receives, so it is asserted exactly.
 */

const ok = (schema: typeof positiveAmount, input: string) => {
  const parsed = schema.safeParse(input);
  return parsed.success ? parsed.data : `error: ${parsed.error.issues[0]?.message}`;
};

describe('positiveAmount', () => {
  it.each([
    ['1234.5', '1234.50'],
    ['1,234.50', '1234.50'],
    ['12,345,678.9', '12345678.90'],
    ['₱1,000', '1000.00'],
    ['$ 5', '5.00'],
    ['+5', '5.00'],
    [' 12 ', '12.00'],
    ['.5', '0.50'],
    ['5.', '5.00'],
    ['0.01', '0.01'],
    // numeric(18,2): sixteen digits and two decimals is the largest value.
    ['9999999999999999.99', '9999999999999999.99'],
  ])('accepts %j as %s', (input, canonical) => {
    expect(ok(positiveAmount, input)).toBe(canonical);
  });

  it.each([
    ['1,23', 'is not a valid amount'],
    ['1,2345', 'is not a valid amount'],
    ['1e3', 'is not a valid amount'],
    ['1_000', 'is not a valid amount'],
    ['١٢', 'is not a valid amount'],
    ['1.2.3', 'is not a valid amount'],
    ['1.234', 'at most 2 decimal places'],
    ['0.001', 'at most 2 decimal places'],
    ['10000000000000000.00', 'too large'],
    ['0', 'greater than zero'],
    ['0.00', 'greater than zero'],
    ['-5', 'greater than zero'],
    ['', 'Enter an amount'],
  ])('refuses %j (%s)', (input, message) => {
    expect(ok(positiveAmount, input)).toContain(message);
  });
});

describe('signedAmount', () => {
  it.each([
    ['-5', '-5.00'],
    ['0', '0.00'],
    ['-9999999999999999.99', '-9999999999999999.99'],
  ])('accepts %j as %s', (input, canonical) => {
    expect(ok(signedAmount, input)).toBe(canonical);
  });

  it('refuses past the database limit in either direction', () => {
    expect(ok(signedAmount, '-10000000000000000')).toContain('too large');
  });
});

describe('isoDate', () => {
  it.each([
    ['2024-02-29', true],
    ['2000-02-29', true],
    ['2023-02-29', false],
    ['2100-02-29', false],
    ['2026-04-31', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['2026-01-01T00:00:00Z', false],
    ['', false],
  ])('%j valid: %s', (input, valid) => {
    expect(isoDate.safeParse(input).success).toBe(valid);
  });
});
