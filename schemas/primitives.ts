import { z } from 'zod';
import {
  MAX_DATABASE_MINOR,
  MoneyError,
  parseDecimal,
  toDecimalString,
} from '@/lib/money';

export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a valid date');

function canonicalMoney(options: { positive: boolean }) {
  return z.string().min(1, 'Enter an amount').transform((value, ctx) => {
    try {
      const minor = parseDecimal(value);
      if (options.positive && minor <= 0n) {
        ctx.addIssue({ code: 'custom', message: 'Amount must be greater than zero' });
        return z.NEVER;
      }
      if (minor > MAX_DATABASE_MINOR || minor < -MAX_DATABASE_MINOR) {
        ctx.addIssue({ code: 'custom', message: 'Amount is too large' });
        return z.NEVER;
      }
      return toDecimalString(minor);
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof MoneyError ? error.message : 'Enter a valid amount',
      });
      return z.NEVER;
    }
  });
}

export const positiveAmount = canonicalMoney({ positive: true });
export const signedAmount = canonicalMoney({ positive: false });
