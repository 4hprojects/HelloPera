import { z } from 'zod';
import {
  ACCOUNT_NATURES,
  ACCOUNT_TYPES,
  DEFAULT_NATURE,
  DIRECTIONS,
  TRANSACTION_TYPES,
} from '@/lib/finance/types';
import { BANK_KINDS } from '@/lib/finance/banks';
import { parseDecimal } from '@/lib/money';
import { isoDate, positiveAmount, signedAmount } from '@/schemas/primitives';

/**
 * Finance validation — Phase 02 §40–42.
 *
 * Amounts are validated as STRINGS and converted to exact minor units. A
 * z.number() here would put every amount through a double before it reached
 * the database, which is precisely what §7 forbids.
 */

const currencyCode = z
  .string()
  .length(3, 'Use a 3-letter currency code')
  .transform((v) => v.toUpperCase());

export const LOAN_FREQUENCIES = [
  'weekly',
  'biweekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;

/** Blank form fields arrive as ''; treat them as absent. */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Bank-only extras: last 4 digits (never the full number) and account kind. */
const bankFields = {
  bankLast4: z.preprocess(
    blankToUndefined,
    z
      .string()
      .trim()
      .regex(/^\d{4}$/, 'Enter exactly 4 digits')
      .optional(),
  ),
  bankKind: z.preprocess(blankToUndefined, z.enum(BANK_KINDS).optional()),
};

const loanFields = {
  paymentAmount: z.preprocess(blankToUndefined, positiveAmount.optional()),
  paymentFrequency: z.preprocess(blankToUndefined, z.enum(LOAN_FREQUENCIES).optional()),
  nextDueDate: z.preprocess(blankToUndefined, isoDate.optional()),
  principal: z.preprocess(blankToUndefined, positiveAmount.optional()),
  loanStartDate: z.preprocess(blankToUndefined, isoDate.optional()),
  interestRateApr: z.preprocess(
    blankToUndefined,
    z.coerce.number().min(0, 'Use 0 to 100').max(100, 'Use 0 to 100').optional(),
  ),
  termMonths: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int('Use whole months')
      .min(1, 'Use 1 to 600')
      .max(600, 'Use 1 to 600')
      .optional(),
  ),
  createReminder: z.boolean().default(true),
};

export const createAccountSchema = z
  .object({
    requestId: z.string().uuid('Reload this page before creating the account.'),
    name: z.string().trim().min(1, 'Name your account').max(80),
    type: z.enum(ACCOUNT_TYPES),
    nature: z.enum(ACCOUNT_NATURES),
    currencyCode: currencyCode.default('PHP'),
    openingBalance: signedAmount.default('0'),
    institutionName: z.string().trim().max(80).optional().or(z.literal('')),
    ...bankFields,
    ...loanFields,
  })
  .superRefine((data, ctx) => {
    // §9: `other` has no sensible default nature, so it must be chosen. Every
    // other type has one, and the client does not get to override it.
    if (data.type !== 'other' && data.nature !== DEFAULT_NATURE[data.type]) {
      ctx.addIssue({
        code: 'custom',
        message: `A ${data.type.replace('_', ' ')} account is ${DEFAULT_NATURE[data.type]}`,
        path: ['nature'],
      });
    }

    if (data.type !== 'bank') {
      for (const key of ['bankLast4', 'bankKind'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Only bank accounts have this field',
            path: [key],
          });
        }
      }
    }

    const loanOnly = [
      'paymentAmount',
      'paymentFrequency',
      'nextDueDate',
      'principal',
      'loanStartDate',
      'interestRateApr',
      'termMonths',
    ] as const;

    if (data.type !== 'loan') {
      for (const key of loanOnly) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Only loans have this field',
            path: [key],
          });
        }
      }
      return;
    }

    const need = (ok: boolean, message: string, path: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message, path: [path] });
    };
    need(!!data.institutionName, 'Enter the lender', 'institutionName');
    need(
      parseDecimal(data.openingBalance) > 0n,
      'Enter the amount you currently owe',
      'openingBalance',
    );
    need(!!data.paymentAmount, 'Enter the amount due per payment', 'paymentAmount');
    need(!!data.paymentFrequency, 'Choose how often you pay', 'paymentFrequency');
    need(!!data.nextDueDate, 'Enter the next due date', 'nextDueDate');
    if (
      data.principal &&
      parseDecimal(data.openingBalance) > 0n &&
      parseDecimal(data.principal) < parseDecimal(data.openingBalance)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Original amount cannot be less than what you owe now',
        path: ['principal'],
      });
    }
  });

export const updateAccountSchema = z
  .object({
    id: z.string().uuid(),
    type: z.enum(ACCOUNT_TYPES),
    name: z.string().trim().min(1, 'Name your account').max(80),
    institutionName: z.string().trim().max(80).optional().or(z.literal('')),
    bankLast4: bankFields.bankLast4,
    bankKind: bankFields.bankKind,
    paymentAmount: loanFields.paymentAmount,
    paymentFrequency: loanFields.paymentFrequency,
    nextDueDate: loanFields.nextDueDate,
    principal: loanFields.principal,
    interestRateApr: loanFields.interestRateApr,
    termMonths: loanFields.termMonths,
  })
  .superRefine((data, ctx) => {
    if (data.type !== 'bank') {
      for (const key of ['bankLast4', 'bankKind'] as const) {
        if (data[key] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: 'Only bank accounts have this field',
            path: [key],
          });
        }
      }
    }
    if (data.type !== 'loan') return;
    const need = (ok: boolean, message: string, path: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', message, path: [path] });
    };
    need(!!data.institutionName, 'Enter the lender', 'institutionName');
    need(!!data.paymentAmount, 'Enter the amount due per payment', 'paymentAmount');
    need(!!data.paymentFrequency, 'Choose how often you pay', 'paymentFrequency');
    need(!!data.nextDueDate, 'Enter the next due date', 'nextDueDate');
  });

/** Amount is only honoured while the transaction settles no obligation. */
export const updateTransactionSchema = z.object({
  id: z.string().uuid(),
  amount: positiveAmount,
  transactionDate: isoDate,
  categoryId: z.string().uuid().optional().nullable(),
  merchantName: z.string().trim().max(120).optional().or(z.literal('')),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

/**
 * Transaction input.
 *
 * The per-type account requirements from §34a are enforced here AND as a CHECK
 * constraint in the migration. Two layers because this is the shape the
 * balance engine assumes: an unbalanceable row must be impossible to write,
 * not merely unlikely.
 */
export const createTransactionSchema = z
  .object({
    requestId: z.string().uuid('Reload this page before saving the transaction.'),
    type: z.enum(TRANSACTION_TYPES),
    direction: z.enum(DIRECTIONS).optional().nullable(),
    amount: positiveAmount,
    currencyCode: currencyCode.default('PHP'),
    transactionDate: isoDate,
    sourceAccountId: z.string().uuid().optional().nullable(),
    destinationAccountId: z.string().uuid().optional().nullable(),
    categoryId: z.string().uuid().optional().nullable(),
    merchantName: z.string().trim().max(120).optional().or(z.literal('')),
    description: z.string().trim().max(200).optional().or(z.literal('')),
    notes: z.string().trim().max(1000).optional().or(z.literal('')),
    refundOfTransactionId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const needsSource = ['expense', 'adjustment', 'transfer'].includes(data.type);
    const needsDestination = ['income', 'refund', 'opening_balance', 'transfer'].includes(
      data.type,
    );

    if (needsSource && !data.sourceAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose an account',
        path: ['sourceAccountId'],
      });
    }
    if (needsDestination && !data.destinationAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose an account',
        path: ['destinationAccountId'],
      });
    }
    if (!needsSource && data.sourceAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: `A ${data.type} has no source account`,
        path: ['sourceAccountId'],
      });
    }
    if (!needsDestination && data.destinationAccountId) {
      ctx.addIssue({
        code: 'custom',
        message: `A ${data.type} has no destination account`,
        path: ['destinationAccountId'],
      });
    }
    if (data.type === 'adjustment' && !data.direction) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose whether this increases or decreases the balance',
        path: ['direction'],
      });
    }
    if (
      data.type === 'transfer' &&
      data.sourceAccountId &&
      data.sourceAccountId === data.destinationAccountId
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose two different accounts',
        path: ['destinationAccountId'],
      });
    }
  });

export const voidTransactionSchema = z.object({
  id: z.string().uuid(),
  reason: z.string().trim().max(200).optional().or(z.literal('')),
});

export const transactionFilterSchema = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  accountId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().trim().max(100).optional(),
  sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
