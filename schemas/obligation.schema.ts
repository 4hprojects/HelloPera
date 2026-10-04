import { z } from 'zod';
import { parseDecimal } from '@/lib/money';
import { isoDate, positiveAmount } from '@/schemas/primitives';

const currencyCode = z
  .string()
  .length(3)
  .transform((v) => v.toUpperCase());

/** Blank form fields arrive as ''; treat them as absent. */
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);

/** Installment terms: monthly payment and number of months, both or neither. */
const installmentFields = {
  installmentAmount: z.preprocess(blankToUndefined, positiveAmount.optional()),
  installmentCount: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int('Use whole months')
      .min(2, 'Use 2 to 600')
      .max(600, 'Use 2 to 600')
      .optional(),
  ),
  /** Installments already paid before this bill was added. */
  installmentsPrior: z.preprocess(
    blankToUndefined,
    z.coerce
      .number()
      .int('Use whole months')
      .min(0, 'Use 0 or more')
      .max(600, 'Use 0 to 600')
      .optional(),
  ),
};

const billObject = z.object({
  providerName: z.string().trim().min(1, 'Who is this bill from?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  dueDate: isoDate,
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
  ...installmentFields,
});

type InstallmentShape = {
  amount: string;
  installmentAmount?: string;
  installmentCount?: number;
  installmentsPrior?: number;
};

function checkInstallments(data: InstallmentShape, ctx: z.RefinementCtx) {
  const hasAmount = data.installmentAmount !== undefined;
  const hasCount = data.installmentCount !== undefined;
  if (hasAmount && !hasCount) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter the number of months',
      path: ['installmentCount'],
    });
  }
  if (hasCount && !hasAmount) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter the monthly payment',
      path: ['installmentAmount'],
    });
  }
  if (data.installmentsPrior && !hasCount) {
    ctx.addIssue({
      code: 'custom',
      message: 'Enter the monthly payment and number of months first',
      path: ['installmentsPrior'],
    });
  }
  if (
    data.installmentsPrior !== undefined &&
    hasCount &&
    data.installmentsPrior > data.installmentCount!
  ) {
    ctx.addIssue({
      code: 'custom',
      message: 'Cannot be more than the number of months',
      path: ['installmentsPrior'],
    });
  }
  if (hasAmount && parseDecimal(data.installmentAmount!) > parseDecimal(data.amount)) {
    ctx.addIssue({
      code: 'custom',
      message: 'Monthly payment cannot be more than the total',
      path: ['installmentAmount'],
    });
  }
}

export const createBillSchema = billObject.superRefine(checkInstallments);

const receivableObject = z.object({
  partyName: z.string().trim().min(1, 'Who owes you?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  borrowedDate: isoDate.optional().or(z.literal('')),
  dueDate: isoDate.optional().or(z.literal('')),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

function checkBorrowedBeforeDue(
  data: { borrowedDate?: string; dueDate?: string },
  ctx: z.RefinementCtx,
) {
  // ISO dates compare correctly as strings.
  if (data.borrowedDate && data.dueDate && data.dueDate < data.borrowedDate) {
    ctx.addIssue({
      code: 'custom',
      message: 'Expected date cannot be before the date borrowed',
      path: ['dueDate'],
    });
  }
}

export const createReceivableSchema =
  receivableObject.superRefine(checkBorrowedBeforeDue);

export const createExpectedIncomeSchema = z.object({
  sourceName: z.string().trim().min(1, 'Where is this income from?').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  expectedDate: isoDate,
  categoryId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().or(z.literal('')),
});

const idField = z.string().uuid();

export const updateBillSchema = billObject
  .omit({ currencyCode: true })
  .extend({ id: idField })
  .superRefine(checkInstallments);
export const updateReceivableSchema = receivableObject
  .omit({ currencyCode: true })
  .extend({ id: idField })
  .superRefine(checkBorrowedBeforeDue);
export const updateExpectedIncomeSchema = createExpectedIncomeSchema
  .omit({ currencyCode: true })
  .extend({ id: idField });

/**
 * Recording a payment.
 *
 * The user either creates a new transaction or points at an existing one
 * (§63). Either way the allocation goes through allocate_payment, which is the
 * only thing that may write a link row.
 */
export const recordPaymentSchema = z
  .object({
    requestId: z.string().uuid('Reload this page before recording a payment.'),
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

/** The three kinds share one edit shape; the action maps kind-specific field names. */
export type UpdateObligationInput = {
  id: string;
  name: string;
  amount: string;
  date: string;
  description?: string;
  notes?: string;
  categoryId?: string | null;
  /** Receivables only: when the money was lent. */
  borrowedDate?: string;
  installmentAmount?: string;
  installmentCount?: number;
  installmentsPrior?: number;
};
