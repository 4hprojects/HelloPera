import { z } from 'zod';

/**
 * Structured extraction schema — Phase 05 §14, §17.
 *
 * Everything is optional. A receipt has no due date; a bill has no merchant.
 * Forcing fields would push the model to invent them, and an invented amount
 * is worse than a missing one.
 *
 * Amounts stay STRINGS all the way through. Parsing to a number here would put
 * every extracted figure through a double before a human ever sees it — the
 * exact thing lib/money exists to prevent.
 */

export const EXTRACTED_DOCUMENT_TYPES = [
  'receipt',
  'expense_confirmation',
  'income_confirmation',
  'transfer_confirmation',
  'bill',
  'invoice',
  'bank_record',
  'ewallet_record',
  'statement',
  'salary_record',
  'receivable_evidence',
  'unknown',
] as const;

export const TARGET_TYPES = [
  'transaction',
  'bill',
  'receivable',
  'expected_income',
  'unknown',
] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

/** A decimal string, or null. Never coerced to a number. */
const amountString = z
  .string()
  .regex(/^\d{1,15}(\.\d{1,2})?$/, 'Amount must be a plain decimal')
  .nullable()
  .optional();

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Not a real date')
  .nullable()
  .optional();

const text = (max: number) => z.string().trim().max(max).nullable().optional();

/** Most records one document may propose. A statement page rarely has more. */
export const MAX_DRAFTS = 30;

/**
 * One record a document could become.
 *
 * A receipt yields one; a statement yields a line each. Like every extracted
 * value it is a proposal: amounts stay strings, everything but `target` may be
 * missing, and nothing here is a financial record until a person saves it.
 */
export const draftSchema = z.object({
  target: z.enum(['transaction', 'bill', 'receivable', 'expected_income']),
  /** Transactions only: money out, or money in. Defaults to expense. */
  direction: z.enum(['expense', 'income']).nullable().optional(),
  /** Merchant, provider, debtor or source, whichever the target calls for. */
  name: text(120),
  amount: amountString,
  /** Transaction date, due date or expected date, per target. */
  date: isoDate,
  description: text(200),
  categorySuggestion: text(60),
  paymentMethod: text(40),
  referenceNumber: text(80),
  /** 0–1, how clearly this line was read. Absent means unknown. */
  confidence: z.number().min(0).max(1).nullable().optional(),
});

export type Draft = z.infer<typeof draftSchema>;

export const extractedFieldsSchema = z.object({
  documentType: z.enum(EXTRACTED_DOCUMENT_TYPES).default('unknown'),
  suggestedTarget: z.enum(TARGET_TYPES).default('unknown'),

  merchantName: text(120),
  providerName: text(120),
  partyName: text(120),

  amount: amountString,
  currencyCode: z
    .string()
    .length(3)
    .transform((v) => v.toUpperCase())
    .nullable()
    .optional(),
  /** True when currency was assumed rather than read (§26). */
  currencyInferred: z.boolean().default(false),

  transactionDate: isoDate,
  dueDate: isoDate,
  expectedDate: isoDate,

  referenceNumber: text(80),
  accountNumber: text(80),
  paymentMethod: text(40),
  categorySuggestion: text(60),
  description: text(200),

  /** Every record this document could become. See `draftsFromFields`. */
  drafts: z.array(draftSchema).max(MAX_DRAFTS).default([]),
});

export type ExtractedFields = z.infer<typeof extractedFieldsSchema>;

/**
 * Per-field confidence, 0–1.
 *
 * Values are not comparable across providers (§65), which is why the provider
 * name is stored alongside them. Absent means unknown — never defaulted to a
 * number, because an invented 0.9 reads as certainty.
 */
export const fieldConfidenceSchema = z.record(z.string(), z.number().min(0).max(1));
export type FieldConfidence = z.infer<typeof fieldConfidenceSchema>;

/** Below this, the UI highlights the field for review (§20). Configurable. */
export const LOW_CONFIDENCE_THRESHOLD = 0.8;

export const extractionResultSchema = z.object({
  fields: extractedFieldsSchema,
  confidence: fieldConfidenceSchema.default({}),
  rawText: z.string().nullable().optional(),
});

export type ExtractionOutput = z.infer<typeof extractionResultSchema>;

/** Fields the user must confirm before a record can be created (§70). */
export const REQUIRED_BY_TARGET: Record<Exclude<TargetType, 'unknown'>, string[]> = {
  transaction: ['amount', 'transactionDate'],
  bill: ['providerName', 'amount', 'dueDate'],
  receivable: ['partyName', 'amount'],
  expected_income: ['providerName', 'amount', 'expectedDate'],
};

export function missingRequiredFields(
  target: TargetType,
  fields: Partial<ExtractedFields>,
): string[] {
  if (target === 'unknown') return [];
  return REQUIRED_BY_TARGET[target].filter((key) => {
    const value = fields[key as keyof ExtractedFields];
    return value === null || value === undefined || value === '';
  });
}

export function lowConfidenceFields(
  confidence: FieldConfidence,
  threshold = LOW_CONFIDENCE_THRESHOLD,
): string[] {
  return Object.entries(confidence)
    .filter(([, score]) => score < threshold)
    .map(([field]) => field);
}

/**
 * The drafts to show for an extraction.
 *
 * Extractions saved before drafts existed carry only the single set of
 * top-level fields; those are shown as one draft so nothing already stored is
 * orphaned. A document the reader could not classify yields none.
 */
export function draftsFromFields(
  fields: Partial<ExtractedFields> | Record<string, unknown>,
): Draft[] {
  const f = fields as Record<string, unknown>;
  const stored = z.array(draftSchema).safeParse(f.drafts);
  if (stored.success && stored.data.length > 0) return stored.data;

  const target = f.suggestedTarget;
  if (
    target !== 'transaction' &&
    target !== 'bill' &&
    target !== 'receivable' &&
    target !== 'expected_income'
  ) {
    return [];
  }
  const str = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const name =
    target === 'receivable'
      ? str(f.partyName)
      : target === 'transaction'
        ? str(f.merchantName)
        : str(f.providerName);
  const date =
    target === 'transaction'
      ? str(f.transactionDate)
      : target === 'expected_income'
        ? str(f.expectedDate)
        : str(f.dueDate);
  return [
    {
      target,
      direction: target === 'transaction' ? 'expense' : null,
      name,
      amount: str(f.amount),
      date,
      description: str(f.description),
      categorySuggestion: str(f.categorySuggestion),
      paymentMethod: str(f.paymentMethod),
      referenceNumber: str(f.referenceNumber),
      confidence: null,
    },
  ];
}

/** What a person must still fill in before this draft can be saved. */
export function missingRequiredFieldsForDraft(
  draft: Pick<Draft, 'target' | 'name' | 'amount' | 'date'>,
): Array<'name' | 'amount' | 'date'> {
  const blank = (v: string | null | undefined) => !v;
  const missing: Array<'name' | 'amount' | 'date'> = [];
  if (draft.target !== 'transaction' && blank(draft.name)) missing.push('name');
  if (blank(draft.amount)) missing.push('amount');
  if (draft.target !== 'receivable' && blank(draft.date)) missing.push('date');
  return missing;
}
