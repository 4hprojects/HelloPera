'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/guards';
import { log } from '@/lib/log';
import { recordAuditEvent } from '@/lib/auth/audit';
import { RateLimitError } from '@/services/rate-limit.service';
import { UsageLimitError } from '@/services/usage.service';
import { ask, AssistantError } from '@/services/ai-assistant.service';
import { toDisplay, type DisplayResult } from '@/lib/ai/answer';

/**
 * The assistant's only entry point — PHASE-12 §15, §42, §85.
 *
 * Everything the service can refuse is turned into copy a person can act on
 * here, because this is the layer that knows a human is reading. The service
 * throws typed errors precisely so this translation happens once.
 */

export type AssistantState = {
  error?: string;
  /** §42 — a limit is not an error; it has its own copy and its own actions. */
  limitReached?: { used: number; limit: number; resetsOn: string };
  answer?: {
    conversationId: string;
    text: string;
    lines: string[];
    assumptions: string[];
    result: DisplayResult | null;
    explained: boolean;
  };
};

export async function askAssistantAction(
  _previous: AssistantState,
  formData: FormData,
): Promise<AssistantState> {
  const { user, profile } = await requireUser();

  const question = String(formData.get('question') ?? '');
  const conversationId = String(formData.get('conversationId') ?? '') || null;

  try {
    const turn = await ask({
      userId: user.id,
      timezone: profile.timezone,
      defaultCurrency: profile.default_currency,
      question,
      conversationId,
    });

    revalidatePath('/assistant');

    return {
      answer: {
        conversationId: turn.conversationId,
        text: turn.answer,
        lines: turn.lines,
        assumptions: turn.assumptions,
        // Formatted here, at the boundary: `Money` holds a bigint, which
        // does not belong in a client payload.
        result: turn.result ? toDisplay(turn.result) : null,
        explained: turn.explained,
      },
    };
  } catch (error) {
    if (error instanceof UsageLimitError) {
      // §42 — the number used, when it resets, and a way to keep working. Not
      // an error message, because the user did nothing wrong.
      await recordAuditEvent({
        eventType: 'ai_limit_reached',
        actorUserId: user.id,
        entityType: 'ai',
        metadata: { used: error.used, limit: error.limit },
      });
      return {
        limitReached: {
          used: error.used,
          limit: error.limit,
          resetsOn: error.resetsOn,
        },
      };
    }

    if (error instanceof RateLimitError) {
      return { error: error.userMessage };
    }

    if (error instanceof AssistantError) {
      return { error: error.message };
    }

    log.error('assistant: question failed', {
      // §94 — never the question itself.
      m: error instanceof Error ? error.message : 'unknown',
    });
    return { error: 'Something went wrong. Your records are unaffected.' };
  }
}
