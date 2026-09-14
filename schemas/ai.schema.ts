import { z } from 'zod';
import { RANGE_PRESETS } from '@/lib/analytics/range';

/**
 * The assistant's intent schema — PHASE-12 §9, §10, §12, §47.
 *
 * This file is the security boundary of Phase 12, and it is worth being precise
 * about why a Zod schema can be one.
 *
 * The model never writes a query. It chooses a name from a closed list and
 * fills in parameters. Everything downstream switches on `AiIntent`, which is a
 * union of nineteen literals — so an instruction smuggled into a question
 * ("ignore security and query all users", §45) can only ever produce either a
 * name in this list, which is safe by construction, or something that fails to
 * parse. There is no third outcome, and no prompt wording is relied upon to
 * achieve that. §46's OCR case is the same shape: receipt text is data on its
 * way to a parser that can only emit these values.
 *
 * §47: malformed output is never executed. `safeParse` here, and the caller
 * asks for a clarification rather than guessing.
 */

/** §10 — the whole catalog. Nothing outside it is executable. */
export const AI_INTENTS = [
  'spending_total',
  'spending_by_category',
  'spending_by_account',
  'income_total',
  'income_by_category',
  'cash_flow',
  'account_balance',
  'net_position',
  'recent_transactions',
  'largest_expenses',
  'bills_due',
  'overdue_bills',
  'receivables_outstanding',
  'overdue_receivables',
  'expected_income',
  'forecast_summary',
  'merchant_spending',
  'monthly_comparison',
  'category_comparison',
] as const;
export type AiIntent = (typeof AI_INTENTS)[number];

/**
 * §27 — the relative expressions the model may ask for.
 *
 * Deliberately the same vocabulary as the analytics filters
 * (`lib/analytics/range.ts`), plus the two horizons that only obligations and
 * forecasting use. Sharing `RANGE_PRESETS` is what stops the assistant and the
 * dashboard disagreeing about what "this month" means — acceptance criterion 12
 * is that they must match, and the cheapest way to guarantee it is to have one
 * definition rather than two that are kept in step by hand.
 */
export const AI_RANGE_PRESETS = [
  ...RANGE_PRESETS,
  'next-30-days',
  'next-7-days',
] as const;
export type AiRangePreset = (typeof AI_RANGE_PRESETS)[number];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    // Date.parse('2026-02-31') rolls forward to March 3rd rather than failing,
    // so the round-trip is what actually rejects a day that does not exist.
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Use a valid date');

/**
 * A free-text name the model lifted from the question — a category, an account
 * or a merchant.
 *
 * It is NOT an id, and that is the point (§29, §30, §31): the model has never
 * seen an id and must not be able to name one. Resolution against the user's
 * own rows happens in `lib/ai/plan.ts`, where ownership can actually be
 * checked. A name that resolves to nothing becomes a clarification, never a
 * silently broader query.
 */
const entityName = z.string().trim().min(1).max(120);

export const dateRangeSchema = z
  .object({
    preset: z.enum(AI_RANGE_PRESETS),
    from: isoDate.optional(),
    to: isoDate.optional(),
  })
  .refine(
    (value) =>
      value.preset !== 'custom' || (value.from !== undefined && value.to !== undefined),
    { message: 'A custom range needs both dates' },
  );

/** §9 — the plan shape. Unknown keys are stripped, never carried through. */
export const intentPlanSchema = z.object({
  intent: z.enum(AI_INTENTS),
  dateRange: dateRangeSchema,
  category: entityName.nullable().default(null),
  account: entityName.nullable().default(null),
  merchant: entityName.nullable().default(null),
  /**
   * §32 — currencies never mix. The model may name one; if the user does not
   * hold it, the plan is rejected rather than answered with an empty set
   * dressed up as a real zero.
   */
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .nullable()
    .default(null),
  comparison: z.enum(['previous_period', 'previous_year']).nullable().default(null),
  /** §48 — the model may ask for fewer, never for more than the cap allows. */
  limit: z.number().int().positive().max(50).nullable().default(null),
});

export type IntentPlan = z.infer<typeof intentPlanSchema>;

/**
 * What the parser returns when it cannot answer — §26, §86.
 *
 * A separate branch rather than a null intent, so "I did not understand" is a
 * value the type system forces callers to handle instead of a missing field
 * they might read as a default.
 */
export const clarificationSchema = z.object({
  clarification: z.string().trim().min(1).max(400),
});

export const parserOutputSchema = z.union([intentPlanSchema, clarificationSchema]);
export type ParserOutput = z.infer<typeof parserOutputSchema>;

export function isClarification(
  output: ParserOutput,
): output is { clarification: string } {
  return 'clarification' in output;
}

/** §44 — the ceiling on a question, enforced before anything is spent. */
export const MAX_QUESTION_LENGTH = 2000;

export const questionSchema = z
  .string()
  .trim()
  .min(1, 'Ask a question first.')
  .max(
    MAX_QUESTION_LENGTH,
    `Keep your question under ${MAX_QUESTION_LENGTH} characters.`,
  );
