import { describe, expect, it } from 'vitest';
import { createAccountSchema } from '@/schemas/finance.schema';

const base = {
  requestId: '3f2b8c1e-5d4a-4b7e-9a10-1c2d3e4f5a6b',
  name: 'Car loan',
  type: 'loan',
  nature: 'liability',
  currencyCode: 'PHP',
  openingBalance: '5000',
  institutionName: 'BDO',
  paymentAmount: '450',
  paymentFrequency: 'monthly',
  nextDueDate: '2026-11-01',
  principal: '',
  loanStartDate: '',
  interestRateApr: '',
  termMonths: '',
  createReminder: true,
};

const fields = (r: ReturnType<typeof createAccountSchema.safeParse>) =>
  r.success ? [] : r.error.issues.map((i) => i.path[0]);

describe('createAccountSchema — loans', () => {
  it('accepts a loan with only the required fields', () => {
    expect(createAccountSchema.safeParse(base).success).toBe(true);
  });

  it('accepts the optional details', () => {
    const r = createAccountSchema.safeParse({
      ...base,
      principal: '6000',
      loanStartDate: '2026-01-01',
      interestRateApr: '7.5',
      termMonths: '24',
    });
    expect(r.success).toBe(true);
  });

  it.each(['institutionName', 'paymentAmount', 'nextDueDate'])('requires %s', (key) => {
    expect(fields(createAccountSchema.safeParse({ ...base, [key]: '' }))).toContain(key);
  });

  it('requires an amount owed above zero', () => {
    expect(fields(createAccountSchema.safeParse({ ...base, openingBalance: '0' }))).toContain(
      'openingBalance',
    );
  });

  it('rejects an original amount below what is owed', () => {
    expect(fields(createAccountSchema.safeParse({ ...base, principal: '1000' }))).toContain(
      'principal',
    );
  });

  it('rejects out-of-range rate and term', () => {
    expect(fields(createAccountSchema.safeParse({ ...base, interestRateApr: '101' }))).toContain(
      'interestRateApr',
    );
    expect(fields(createAccountSchema.safeParse({ ...base, termMonths: '0' }))).toContain(
      'termMonths',
    );
  });

  it('rejects a loan submitted as an asset', () => {
    expect(fields(createAccountSchema.safeParse({ ...base, nature: 'asset' }))).toContain(
      'nature',
    );
  });

  it('rejects loan fields on other account types', () => {
    const r = createAccountSchema.safeParse({
      ...base,
      type: 'cash',
      nature: 'asset',
      institutionName: '',
    });
    expect(fields(r)).toEqual(expect.arrayContaining(['paymentAmount', 'nextDueDate']));
  });

  it('still accepts a plain cash account', () => {
    const r = createAccountSchema.safeParse({
      requestId: base.requestId,
      name: 'Wallet',
      type: 'cash',
      nature: 'asset',
      openingBalance: '100',
    });
    expect(r.success).toBe(true);
  });
});
