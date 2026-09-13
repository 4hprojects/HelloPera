import { z } from 'zod';
import { MoneyError, parseDecimal } from '@/lib/money';

const positiveAmount = z
  .string()
  .min(1, 'Enter an amount')
  .superRefine((value, ctx) => {
    try {
      if (parseDecimal(value) <= 0n) {
        ctx.addIssue({ code: 'custom', message: 'Amount must be greater than zero' });
      }
    } catch (error) {
      ctx.addIssue({
        code: 'custom',
        message: error instanceof MoneyError ? error.message : 'Enter a valid amount',
      });
    }
  });

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Use a valid date');

const currencyCode = z
  .string()
  .length(3)
  .transform((v) => v.toUpperCase());

export const createBillSchema = z.object({
  providerName: z.string().trim().min(1, 'Who is this bill from?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  dueDate: isoDate,
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const createReceivableSchema = z.object({
  partyName: z.string().trim().min(1, 'Who owes you?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  dueDate: isoDate.optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

export const createExpectedIncomeSchema = z.object({
  sourceName: z.string().trim().min(1, 'Where is this income from?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  expectedDate: isoDate,
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

/**
 * Recording a payment.
 *
 * The user either creates a new transaction or points at an existing one
 * (§63). Either way the allocation goes through allocate_payment, which is the
 * only thing that may write a link row.
 */
export const recordPaymentSchema = z
  .object({
    obligationType: z.enum(['bill', 'receivable', 'expected_income']),
    obligationId: z.string().uuid(),
    mode: z.enum(['new', 'existing']).default('new'),
    amount: positiveAmount,
    // mode = new
    accountId: z.string().uuid().optional().nullable(),
    transactionDate: isoDate.optional(),
    // mode = existing
    transactionId: z.string().uuid().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'new') {
      if (!data.accountId) {
        ctx.addIssue({
          code: 'custom',
          message: 'Choose an account',
          path: ['accountId'],
        });
      }
      if (!data.transactionDate) {
        ctx.addIssue({
          code: 'custom',
          message: 'Choose a date',
          path: ['transactionDate'],
        });
      }
    } else if (!data.transactionId) {
      ctx.addIssue({
        code: 'custom',
        message: 'Choose a transaction',
        path: ['transactionId'],
      });
    }
  });

export type CreateBillInput = z.infer<typeof createBillSchema>;
export type CreateReceivableInput = z.infer<typeof createReceivableSchema>;
export type CreateExpectedIncomeInput = z.infer<typeof createExpectedIncomeSchema>;
export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;
