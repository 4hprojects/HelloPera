/**
 * AI provider abstraction — PHASE-12 §6, §40 of Phase 09.
 *
 * Deliberately the same shape as `lib/ocr/provider.ts`: a narrow interface, a
 * named implementation, and a module-level swap for tests
 * (`services/ocr.service.ts:22-31` is the precedent). Matching the existing
 * convention is worth more here than a marginally nicer one, because a second
 * way of doing provider abstraction is a second thing to learn and a second
 * place for a rule like "never let provider vocabulary into the domain" to be
 * applied inconsistently.
 *
 * Nothing in this file mentions a model or a vendor. §7 keeps identifiers in
 * `lib/ai/model.ts`; adapters keep everything else.
 */

/** Which of the two calls a usage row describes (§54). */
export type AiCallType = 'intent' | 'explanation';

/**
 * What a call cost.
 *
 * "Units" rather than "tokens" on purpose — a future provider may not bill in
 * tokens, and Phase 09 §40 forbids the domain taking on one provider's
 * vocabulary. `ai_usage_logs` uses the same words.
 */
export type AiUsage = {
  model: string;
  inputUnits: number;
  outputUnits: number;
  durationMs: number;
};

export type StructuredRequest = {
  system: string;
  /** The user's question, already length-checked. Framed as data by the adapter. */
  user: string;
  /** The tool the model must call — this is what makes output schema-shaped. */
  tool: {
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  };
};

/**
 * `output` is `unknown` deliberately.
 *
 * The adapter does not validate it against the domain schema — that happens in
 * `lib/ai/plan.ts`, which is the one place allowed to decide what is
 * executable. An adapter returning a typed value would be asserting a shape it
 * has no authority over.
 */
export type StructuredResponse = { output: unknown; usage: AiUsage };

export type TextRequest = {
  system: string;
  user: string;
};

export type TextResponse = { text: string; usage: AiUsage };

export interface AIProvider {
  readonly name: string;
  /** False for the no-op, so callers can fall back without special cases. */
  readonly isLive: boolean;
  generateStructured(request: StructuredRequest): Promise<StructuredResponse>;
  generateText(request: TextRequest): Promise<TextResponse>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly code: string = 'PROVIDER_ERROR',
  ) {
    super(message);
    this.name = 'AiProviderError';
  }
}

/**
 * The provider when none is configured.
 *
 * It refuses rather than returning something plausible. A mock that produced a
 * believable intent would let the assistant appear to work in development and
 * fail only in production — the same reasoning that kept
 * `NoopBillingProvider` honest in Phase 09.
 *
 * Refusing is not the same as the feature being broken: §51's deterministic
 * path answers a real set of questions without any provider at all, and §93
 * requires exactly this degradation.
 */
export class NoopAIProvider implements AIProvider {
  readonly name = 'noop';
  readonly isLive = false;

  async generateStructured(): Promise<StructuredResponse> {
    throw new AiProviderError('The assistant is not configured.', 'NOT_CONFIGURED');
  }

  async generateText(): Promise<TextResponse> {
    throw new AiProviderError('The assistant is not configured.', 'NOT_CONFIGURED');
  }
}
