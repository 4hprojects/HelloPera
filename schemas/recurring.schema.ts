import { z } from 'zod';
import { MoneyError, parseDecimal } from '@/lib/money';
import { FREQUENCIES } from '@/lib/recurring/schedule';

/**
 * Recurring rule validation — PHASE-07 §57, §58.
 *
 * Until now these rules existed only as database CHECK constraints, which
 * means a bad value surfaced as a Postgres error code rather than a message
 * beside the field that caused it. The constraints stay — they are the
 * guarantee — but the user should never be the one to discover them.
 */

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

export const RULE_TYPES = ['income', 'expense', 'bill', 'expected_income'] as const;
export type RuleType = (typeof RULE_TYPES)[number];

/** Empty string from an unfilled form field means "not provided". */
const optionalUuid = z
  .string()
  .uuid('Choose a valid option')
  .optional()
  .nullable()
  .or(z.literal(''));

const base = z.object({
  ruleType: z.enum(RULE_TYPES),
  name: z.string().trim().min(1, 'Give this rule a name').max(80),
  description: z.string().trim().max(200).optional().or(z.literal('')),
  amount: positiveAmount,
  currencyCode: currencyCode.default('PHP'),
  frequency: z.enum(FREQUENCIES),
  // §9 — the database caps this at 52; "every 60 months" is far likelier to be
  // a typo than an intention.
  intervalCount: z.coerce
    .number()
    .int('Use a whole number')
    .min(1, 'Repeat at least every 1')
    .max(52, 'Use 52 or fewer'),
  startDate: isoDate,
  endDate: isoDate.optional().or(z.literal('')),
  dayOfMonth: z.coerce.number().int().min(1).max(31).optional().nullable(),
  /** ISO 1 = Monday … 7 = Sunday. */
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional().nullable(),
  accountId: optionalUuid,
  categoryId: optionalUuid,
  providerName: z.string().trim().max(80).optional().or(z.literal('')),
  sourceName: z.string().trim().max(80).optional().or(z.literal('')),
});

/**
 * Cross-field rules.
 *
 * §58 says a monthly rule "requires day_of_month, or derive from start_date".
 * Deriving is the better half of that choice — asking twice for something the
 * start date already says is a question with one correct answer, and a form
 * that can disagree with itself invites the disagreement. So `dayOfMonth` is
 * optional everywhere, and `occurrenceAt` falls back to the start date's day.
 * What is validated here is that a value the user *did* supply is reachable.
 */
function crossFieldRules(value: z.infer<typeof base>, ctx: z.RefinementCtx): void {
  // §57 — end_date >= start_date.
  if (value.endDate && value.endDate < value.startDate) {
    ctx.addIssue({
      code: 'custom',
      path: ['endDate'],
      message: 'The end date cannot be before the start date',
    });
  }

  const isWeekly = value.frequency === 'weekly' || value.frequency === 'biweekly';

  // A day_of_week on a monthly rule, or a day_of_month on a weekly one, is
  // silently ignored by the generator. Silently is the problem: the user set
  // it deliberately and would never learn it did nothing.
  if (isWeekly && value.dayOfMonth != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['dayOfMonth'],
      message: 'A weekly rule repeats on a weekday, not a day of the month',
    });
  }
  if (!isWeekly && value.dayOfWeek != null) {
    ctx.addIssue({
      code: 'custom',
      path: ['dayOfWeek'],
      message: 'A monthly rule repeats on a day of the month, not a weekday',
    });
  }

  // §27, §28 — a bill needs a provider and expected income needs a source.
  // Both fall back to the rule name in generate_occurrence, so this is a
  // nudge rather than a hard requirement.
  if (value.ruleType === 'bill' && !value.providerName && !value.name) {
    ctx.addIssue({
      code: 'custom',
      path: ['providerName'],
      message: 'Who is this bill from?',
    });
  }
}

export const createRecurringRuleSchema = base.superRefine(crossFieldRules);

/**
 * Editing. Same shape, plus the id and the §67 decision about what happens to
 * occurrences already generated but not yet fulfilled.
 */
export const updateRecurringRuleSchema = base
  .extend({
    id: z.string().uuid(),
    /**
     * §23, §67 — "Apply to future generated events?". Past and fulfilled
     * events never change, whatever this says.
     */
    applyToFuture: z
      .union([z.literal('on'), z.literal('true'), z.literal('')])
      .optional()
      .transform((v) => v === 'on' || v === 'true'),
  })
  .superRefine((value, ctx) => crossFieldRules(value, ctx));

/** Pause, resume and end are state transitions, not edits (§14, §21, §22, §24). */
export const ruleTransitionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['pause', 'resume', 'end']),
  /** Required for `end`; the rule stops generating after this date (§24). */
  endDate: isoDate.optional().or(z.literal('')),
});

/** §41, §42 — acting on a single occurrence, never the whole rule. */
export const expectedEventActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(['skip', 'cancel', 'fulfill', 'include', 'exclude']),
  /** §39 — fulfilment links the event to the transaction that satisfied it. */
  transactionId: z.string().uuid().optional().or(z.literal('')),
});

export type CreateRecurringRuleInput = z.infer<typeof createRecurringRuleSchema>;
export type UpdateRecurringRuleInput = z.infer<typeof updateRecurringRuleSchema>;
export type RuleTransitionInput = z.infer<typeof ruleTransitionSchema>;
export type ExpectedEventActionInput = z.infer<typeof expectedEventActionSchema>;
