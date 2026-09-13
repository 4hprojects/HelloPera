import { describe, expect, it } from 'vitest';
import { compactMoney, dueLabel } from './format';

describe('compactMoney', () => {
  it('compacts thousands and millions', () => {
    expect(compactMoney(60_000_00, 'PHP')).toBe('₱60K');
    expect(compactMoney(1_200_000_00, 'PHP')).toBe('₱1.2M');
    expect(compactMoney(480_00, 'PHP')).toBe('₱480');
    expect(compactMoney(0, 'PHP')).toBe('₱0');
  });

  it('puts the sign before the symbol, not after it', () => {
    // ₱-60K reads as a currency called "peso-minus".
    expect(compactMoney(-60_000_00, 'PHP')).toBe('−₱60K');
    expect(compactMoney(-480_00, 'PHP')).toBe('−₱480');
  });

  it('accepts bigint minor units', () => {
    expect(compactMoney(60_000_00n, 'PHP')).toBe('₱60K');
  });

  it('falls back to the code for a currency with no symbol', () => {
    expect(compactMoney(5_000_00, 'AUD')).toBe('AUD 5K');
  });

  it('drops a trailing .0', () => {
    expect(compactMoney(2_000_000_00, 'PHP')).toBe('₱2M');
  });
});

describe('dueLabel', () => {
  it('describes the days remaining', () => {
    expect(dueLabel(0)).toBe('Due today');
    expect(dueLabel(1)).toBe('1 day left');
    expect(dueLabel(7)).toBe('7 days left');
  });

  it('describes lateness without a negative number', () => {
    expect(dueLabel(-1)).toBe('1 day overdue');
    expect(dueLabel(-5)).toBe('5 days overdue');
  });

  it('says nothing for an undated obligation', () => {
    expect(dueLabel(null)).toBeNull();
    expect(dueLabel(null, 'expected')).toBeNull();
  });

  it('does not call expected income late — nobody owes it', () => {
    expect(dueLabel(-32, 'expected')).toBe('32 days ago');
    expect(dueLabel(-1, 'expected')).toBe('1 day ago');
    expect(dueLabel(0, 'expected')).toBe('Expected today');
    expect(dueLabel(13, 'expected')).toBe('13 days left');
  });
});
