import { formatMoney } from '@/lib/money';
import { AI_INTENTS, AI_RANGE_PRESETS } from '@/schemas/ai.schema';
import type { PlanContext } from '@/lib/ai/plan';
import type { DeterministicAnswer } from '@/lib/ai/answer';
import type { AiAnswerResult } from '@/types/ai';

/**
 * The two prompts — PHASE-12 §8, §22, §23, §24, §36, §50, §79.
 *
 * Kept out of the adapter, because they are domain decisions rather than
 * provider ones: what the assistant may be asked, what it may say, and what it
 * is given to say it with would all survive a change of model.
 *
 * ## What these prompts are not
 *
 * They are not the security boundary. A prompt is advice; `parserOutputSchema`
 * is enforcement. If the wording here were deleted entirely, the worst outcome
 * would be a worse hit-rate on understanding questions — not a wider query,
 * not another user's data, not an invented figure. That separation is the
 * whole design, and it is worth stating where the temptation to rely on
 * wording is strongest.
 */

/**
 * The tool the intent parser must call — §9, §47.
 *
 * The schema is generated from the same constants Zod validates against, so
 * the model is told about exactly the intents that will be accepted. A
 * hand-maintained copy would drift, and the drift would show up as
 * "unparseable" answers to perfectly reasonable questions.
 */
export const INTENT_TOOL = {
  name: 'answer_question',
  description:
    'Record what the user is asking about their own finances, or ask for clarification if the question is ambiguous or outside what HelloPera can answer.',
  inputSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      intent: {
        type: 'string',
        enum: [...AI_INTENTS],
        description: 'Which supported question this is.',
      },
      dateRange: {
        type: 'object',
        additionalProperties: false,
        properties: {
          preset: { type: 'string', enum: [...AI_RANGE_PRESETS] },
          from: { type: 'string', description: 'YYYY-MM-DD, only for preset "custom"' },
          to: { type: 'string', description: 'YYYY-MM-DD, only for preset "custom"' },
        },
        required: ['preset'],
      },
      category: {
        type: ['string', 'null'],
        description: 'A category name as the user wrote it. Never an id.',
      },
      account: {
        type: ['string', 'null'],
        description: 'An account name as the user wrote it. Never an id.',
      },
      merchant: { type: ['string', 'null'] },
      currency: { type: ['string', 'null'], description: 'ISO 4217, e.g. "PHP"' },
      comparison: {
        type: ['string', 'null'],
        enum: ['previous_period', 'previous_year', null],
      },
      limit: { type: ['integer', 'null'], description: 'At most 10.' },
      clarification: {
        type: ['string', 'null'],
        description:
          "Set this INSTEAD of intent when the question is ambiguous, unsupported, or not about the user's own finances. One short question back.",
      },
    },
  },
} as const;

/** §27 — the model resolves relative dates against the user's own today. */
export function intentSystemPrompt(context: PlanContext): string {
  const accounts = context.accounts.map((a) => a.name).join(', ') || 'none yet';
  const categories = context.categories.map((c) => c.name).join(', ') || 'none yet';

  return `You turn a question about personal finances into one supported query.

Today is ${context.today} in the user's timezone (${context.timezone}).
Their default currency is ${context.defaultCurrency}.
Their accounts: ${accounts}.
Their categories: ${categories}.

Rules:
- Choose exactly one intent from the list, or set clarification instead.
- Resolve relative dates ("last month", "this year") to a preset. Use "custom"
  with explicit dates only when the user named specific ones.
- For questions about what is coming up, use "next-7-days" or "next-30-days".
- Copy category, account and merchant names as the user wrote them. You do not
  know any ids and must never invent one.
- Set comparison only when the user actually asked to compare.
- If the question is not about this user's own recorded finances — general
  financial advice, another person's money, anything outside HelloPera — set
  clarification and explain briefly what you can answer instead.
- If a question could mean two different things, ask which. A clarification is
  a better answer than a confident guess at the wrong question.`;
}

/**
 * §50 — the explanation call receives figures and nothing else.
 *
 * Not rows, not OCR text, not a database payload. The model is handed the same
 * sentence the deterministic path would have produced, plus the numbers behind
 * it, and asked to say it better. It cannot compute a total because it was
 * never given the transactions to compute one from.
 */
export function explanationPrompt(
  result: AiAnswerResult,
  deterministic: DeterministicAnswer,
): { system: string; user: string } {
  const figures = result.figures
    .map((f) => `${f.label}: ${formatMoney(f.amount)}`)
    .join('\n');

  const items = result.items
    .map((i) => `- ${i.label}: ${formatMoney(i.amount)}${i.date ? ` (${i.date})` : ''}`)
    .join('\n');

  const comparison = result.comparison
    ? `\n${result.comparison.label}:\n${result.comparison.figures
        .map((f) => `${f.label}: ${formatMoney(f.amount)}`)
        .join('\n')}`
    : '';

  return {
    system: `You explain figures that have already been calculated.

Rules:
- Use ONLY the figures given to you. Never calculate a new total, never round,
  never estimate, and never introduce a number that is not in the data below.
  If something is not there, it is not known.
- Write two or three short sentences. Plain English, no headings, no bullets.
- Philippine peso amounts are already formatted. Copy them exactly as written.
- Describe what the numbers show. Do not tell the user what to do with their
  money, recommend products, or predict outcomes. HelloPera explains a person's
  own records; it does not give financial advice.
- If a shortfall or an overdue amount is present, say so plainly — that is the
  part they need to notice.`,
    user: `Period: ${result.range.label} (${result.range.from} to ${result.range.to})
Currency: ${result.currency}

${figures}${comparison}
${items ? `\nBreakdown:\n${items}` : ''}
${result.assumptions.length > 0 ? `\nAssumptions:\n${result.assumptions.map((a) => `- ${a}`).join('\n')}` : ''}

A plain version of the answer, for reference:
${deterministic.text}`,
  };
}
