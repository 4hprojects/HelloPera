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
