import { z } from 'zod';
import {
  ACCOUNT_NATURES,
  ACCOUNT_TYPES,
  DIRECTIONS,
  TRANSACTION_TYPES,
} from '@/lib/finance/types';
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

export const createAccountSchema = z
  .object({
    requestId: z.string().uuid('Reload this page before creating the account.'),
    name: z.string().trim().min(1, 'Name your account').max(80),
    type: z.enum(ACCOUNT_TYPES),
    nature: z.enum(ACCOUNT_NATURES),
    currencyCode: currencyCode.default('PHP'),
    openingBalance: signedAmount.default('0'),
    institutionName: z.string().trim().max(80).optional().or(z.literal('')),
  })
  .refine(
    (data) => data.type !== 'other' || ACCOUNT_NATURES.includes(data.nature),
    // §9: `other` has no sensible default nature, so it must be chosen.
    {
      message: 'Choose whether this account is an asset or a liability',
      path: ['nature'],
    },
  );

export const updateAccountSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(80),
  institutionName: z.string().trim().max(80).optional().or(z.literal('')),
  isArchived: z.boolean().optional(),
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
export type TransactionFilter = z.infer<typeof transactionFilterSchema>;
