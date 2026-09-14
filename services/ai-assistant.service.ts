import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { log } from '@/lib/log';
import { enforceRateLimit } from '@/services/rate-limit.service';
import {
  assertWithinLimit,
  recordUsage,
  UsageLimitError,
} from '@/services/usage.service';
import { getEntitlements, isFlagEnabled } from '@/services/plan.service';
import { buildPlanContext, executePlan } from '@/services/ai-query.service';
import { recordAuditEvent } from '@/lib/auth/audit';
import { validatePlan, type PlanContext } from '@/lib/ai/plan';
import { benefitsFromExplanation, renderAnswer } from '@/lib/ai/answer';
import { INTENT_TOOL, explanationPrompt, intentSystemPrompt } from '@/lib/ai/prompt';
import { ClaudeAIProvider } from '@/lib/ai/claude-provider';
import {
  AiProviderError,
  NoopAIProvider,
  type AIProvider,
  type AiCallType,
  type AiUsage,
} from '@/lib/ai/provider';
import { questionSchema } from '@/schemas/ai.schema';
import { todayInTimezone } from '@/lib/finance/obligation';
import type { AiAnswerResult } from '@/types/ai';

/**
 * The assistant — PHASE-12 §15, §41, §43, §44, §53, §54, §56, §92, §93.
 *
 * One question, one sequence. The ordering is not incidental: each step is
 * placed so that the cheapest refusal happens first and nothing is spent on a
 * request that was never going to be answered.
 *
 *   flag → rate limit → length → quota → [parse] → validate → execute → answer
 *
 * §41 says apply the Phase 09 §17 metering rule rather than restate it, so the
 * placement here mirrors `services/ocr.service.ts` exactly: the quota gate sits
 * before any provider call, and `recordUsage` sits after the call is committed
 * to. One question is one unit even when it makes two provider calls, because
 * the user asked one question.
 */

/** §8 — provider selection, the same shape `services/ocr.service.ts` uses. */
let provider: AIProvider | null = null;

export function getProvider(): AIProvider {
  if (!provider) {
    // Presence of a key decides. No AI_PROVIDER switch: with one adapter a
    // switch is a setting that can only be wrong, and the failure it produces
    // is worse than the honest absence the no-op reports.
    provider =
      process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN
        ? new ClaudeAIProvider()
        : new NoopAIProvider();
  }
  return provider;
}

export function setProviderForTesting(p: AIProvider | null): void {
  provider = p;
}

export class AssistantError extends Error {
  constructor(
    message: string,
    readonly code: string = 'ASSISTANT_ERROR',
  ) {
    super(message);
    this.name = 'AssistantError';
  }
}

/** What the UI renders for one turn. */
export type AssistantTurn = {
  conversationId: string;
  /** The sentence shown to the user. */
  answer: string;
  /** Breakdown rows, already formatted and capped. */
  lines: string[];
  assumptions: string[];
  /** Structured figures, so the UI can render them rather than parse prose. */
  result: AiAnswerResult | null;
  /** True when the wording came from a model rather than a template. */
  explained: boolean;
};

type UsageRow = {
  callType: AiCallType;
  usage: AiUsage;
  status: 'succeeded' | 'failed' | 'timeout' | 'rejected';
  errorCode?: string | null;
};

/**
 * §54 — provider calls, for cost analysis.
 *
 * Never throws. A failure to record what a call cost must not fail the answer
 * the user already paid for; it is loud in the log instead.
 */
async function logProviderCall(
  userId: string,
  conversationId: string | null,
  intent: string | null,
  providerName: string,
  row: UsageRow,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('ai_usage_logs').insert({
      user_id: userId,
      conversation_id: conversationId,
      intent,
      provider: providerName,
      model: row.usage.model,
      call_type: row.callType,
      input_units: row.usage.inputUnits,
      output_units: row.usage.outputUnits,
      duration_ms: row.usage.durationMs,
      status: row.status,
      error_code: row.errorCode ?? null,
    });
  } catch (error) {
    log.error('ai: usage log failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** §17 — a thread, created on first question. */
async function ensureConversation(
  userId: string,
  conversationId: string | null,
  question: string,
): Promise<string> {
  const admin = createAdminClient();

  if (conversationId) {
    // Ownership is checked explicitly because this write uses the admin client,
    // which bypasses RLS. A conversation id is a uuid someone could paste.
    const { data } = await admin
      .from('ai_conversations')
      .select('id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!data) throw new AssistantError('That conversation is unavailable.', 'NOT_FOUND');

    await admin
      .from('ai_conversations')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', conversationId);
    return conversationId;
  }

  // The first question becomes the title. Trimmed rather than summarised by a
  // model: a title is not worth a provider call, and the user's own words are
  // the most recognisable label a thread can have.
  const title = question.length > 60 ? `${question.slice(0, 57)}…` : question;

  const { data, error } = await admin
    .from('ai_conversations')
    .insert({ user_id: userId, title })
    .select('id')
    .single();

  if (error || !data) throw new AssistantError('Could not start a conversation.');

  await recordAuditEvent({
    eventType: 'ai_conversation_created',
    actorUserId: userId,
    entityType: 'ai',
    entityId: String(data.id),
  });

  return String(data.id);
}

/** §18 — question, answer and safe intent metadata. Never the result payload. */
async function saveMessages(
  userId: string,
  conversationId: string,
  question: string,
  answer: string,
  result: AiAnswerResult | null,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('ai_messages').insert([
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'user',
      content: question,
      query_metadata: {},
    },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: 'assistant',
      content: answer,
      intent: result?.intent ?? null,
      // Enough to explain why the answer said what it said. Not a second copy
      // of the user's finances in a column no retention policy covers.
      query_metadata: result
        ? { range: result.range, currency: result.currency, empty: result.empty }
        : {},
    },
  ]);
}

export type AskParams = {
  userId: string;
  timezone: string;
  defaultCurrency: string;
  question: string;
  conversationId?: string | null;
};

export async function ask(params: AskParams): Promise<AssistantTurn> {
  // §92 — off means the assistant does not exist, not that it answers sadly.
  if (!(await isFlagEnabled('ai_enabled'))) {
    throw new AssistantError('The assistant is not available yet.', 'DISABLED');
  }

  // §43 — technical abuse protection, before anything is read or spent.
  await enforceRateLimit('ai_question', params.userId);

  // §44 — length, before the quota is touched: a 50,000-character paste is
  // refused without costing the user one of their questions.
  const parsedQuestion = questionSchema.safeParse(params.question);
  if (!parsedQuestion.success) {
    throw new AssistantError(
      parsedQuestion.error.issues[0]?.message ?? 'That question is too long.',
      'INVALID_QUESTION',
    );
  }
  const question = parsedQuestion.data;

  const entitlements = await getEntitlements(params.userId);
  const today = todayInTimezone(params.timezone);

  // §17 of Phase 09 — the quota gate sits BEFORE any provider call, so a
  // refused question costs nothing and counts nothing. Throws UsageLimitError,
  // which the action turns into §42's copy.
  await assertWithinLimit(params.userId, 'ai_queries', params.timezone);

  const context: PlanContext = await buildPlanContext({
    userId: params.userId,
    timezone: params.timezone,
    today,
    defaultCurrency: params.defaultCurrency,
    advancedAnalytics: entitlements.advancedAnalytics,
    forecastHorizonDays: entitlements.forecastHorizonDays,
  });

  const active = getProvider();
  const conversationId = await ensureConversation(
    params.userId,
    params.conversationId ?? null,
    question,
  );

  // ---- Intent parsing -----------------------------------------------------
  //
  // §93 — with no provider there is no parse, and therefore no answer. The
  // deterministic layer can render figures but it cannot read English, and
  // pretending otherwise with keyword matching would answer the wrong question
  // confidently. Saying so is the honest degradation.
  if (!active.isLive) {
    const message =
      'The assistant is not connected yet. Your analytics, forecast and records all still work.';
    await saveMessages(params.userId, conversationId, question, message, null);
    throw new AssistantError(message, 'NOT_CONFIGURED');
  }

  let raw: unknown;
  try {
    const parsed = await active.generateStructured({
      system: intentSystemPrompt(context),
      user: question,
      tool: INTENT_TOOL,
    });
    raw = parsed.output;

    // §17 — counted here, once the provider call is committed to. A provider
    // error after this point still counts: it cost money either way, and the
    // user gets a clear failure rather than a silent charge.
    await recordUsage(params.userId, 'ai_queries', params.timezone);
    await logProviderCall(params.userId, conversationId, null, active.name, {
      callType: 'intent',
      usage: parsed.usage,
      status: 'succeeded',
    });
  } catch (error) {
    const code = error instanceof AiProviderError ? error.code : 'PROVIDER_ERROR';
    // A provider that never answered cost nothing, so nothing is counted.
    await logProviderCall(params.userId, conversationId, null, active.name, {
      callType: 'intent',
      usage: { model: 'unknown', inputUnits: 0, outputUnits: 0, durationMs: 0 },
      status: code === 'TIMEOUT' ? 'timeout' : 'failed',
      errorCode: code,
    });
    throw new AssistantError(
      error instanceof AiProviderError
        ? error.message
        : 'The assistant is unavailable right now.',
      code,
    );
  }

  // ---- Validation ---------------------------------------------------------
  const decision = validatePlan(raw, context);

  if (!decision.ok) {
    // §26, §86 — a clarification is a legitimate answer, not an error. It is
    // saved as an assistant turn so the thread reads as a conversation.
    await saveMessages(params.userId, conversationId, question, decision.message, null);
    await recordAuditEvent({
      eventType: 'ai_query_executed',
      actorUserId: params.userId,
      entityType: 'ai',
      entityId: conversationId,
      // §94 — the reason, never the prompt.
      metadata: { outcome: decision.reason },
    });
    return {
      conversationId,
      answer: decision.message,
      lines: [],
      assumptions: [],
      result: null,
      explained: false,
    };
  }

  // ---- Execution ----------------------------------------------------------
  const result = await executePlan(decision.plan, context);
  const deterministic = renderAnswer(result);

  // ---- Wording ------------------------------------------------------------
  //
  // §52 — the model is asked only where there is something to explain, and it
  // receives the figures alone (§50). A failure here falls back to the
  // deterministic sentence rather than losing the answer: the numbers were
  // already correct, only the phrasing was at stake.
  let answer = deterministic.text;
  let explained = false;

  if (benefitsFromExplanation(result)) {
    try {
      const prose = await active.generateText(explanationPrompt(result, deterministic));
      answer = prose.text;
      explained = true;
      await logProviderCall(params.userId, conversationId, result.intent, active.name, {
        callType: 'explanation',
        usage: prose.usage,
        status: 'succeeded',
      });
    } catch (error) {
      log.warn('ai: explanation failed, using the template', {
        m: error instanceof Error ? error.message : 'unknown',
      });
      await logProviderCall(params.userId, conversationId, result.intent, active.name, {
        callType: 'explanation',
        usage: { model: 'unknown', inputUnits: 0, outputUnits: 0, durationMs: 0 },
        status: 'failed',
        errorCode: error instanceof AiProviderError ? error.code : 'PROVIDER_ERROR',
      });
    }
  }

  await saveMessages(params.userId, conversationId, question, answer, result);
  await recordAuditEvent({
    eventType: 'ai_query_executed',
    actorUserId: params.userId,
    entityType: 'ai',
    entityId: conversationId,
    metadata: { intent: result.intent, explained },
  });

  return {
    conversationId,
    answer,
    lines: deterministic.lines,
    assumptions: deterministic.assumptions,
    result,
    explained,
  };
}

export { UsageLimitError };

/** §18 — one thread, oldest first. Read through RLS, so scoping is the database's. */
export async function getConversation(conversationId: string) {
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from('ai_conversations')
    .select('id, title, is_archived, updated_at')
    .eq('id', conversationId)
    .maybeSingle();

  if (!conversation) return null;

  const { data: messages } = await supabase
    .from('ai_messages')
    .select('id, role, content, intent, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  return { conversation, messages: messages ?? [] };
}

export async function listConversations(limit = 20) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('ai_conversations')
    .select('id, title, updated_at')
    .eq('is_archived', false)
    .order('updated_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}
