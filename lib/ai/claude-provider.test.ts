import { describe, expect, it, vi } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { ClaudeAIProvider } from '@/lib/ai/claude-provider';
import { AiProviderError } from '@/lib/ai/provider';
import { INTENT_MODEL } from '@/lib/ai/model';

/**
 * The adapter, against a stubbed SDK.
 *
 * The constructor takes a client as a seam precisely so this file exists: the
 * adapter is the one piece of Phase 12 that would otherwise need a key and a
 * network to verify, and "we will find out in production" is not a test
 * strategy for the layer that decides what the model was asked.
 */

const TOOL = {
  name: 'answer_question',
  description: 'Record the intent.',
  inputSchema: { type: 'object', properties: {} },
};

const request = {
  system: 'You classify questions.',
  user: 'How much did I spend on food?',
  tool: TOOL,
};

const usage = { input_tokens: 120, output_tokens: 35 };

/** A stub shaped like the one method the adapter calls. */
function stub(response: unknown) {
  const create = vi.fn().mockResolvedValue(response);
  const client = { messages: { create } } as unknown as Anthropic;
  return { client, create };
}

function toolUseResponse(input: unknown) {
  return {
    model: INTENT_MODEL,
    stop_reason: 'tool_use',
    usage,
    content: [{ type: 'tool_use', name: TOOL.name, input }],
  };
}

describe('generateStructured', () => {
  it('forces the tool call rather than allowing prose', async () => {
    // Without tool_choice, "what is the weather" comes back as a paragraph and
    // the caller has to invent a meaning for a missing tool call.
    const { client, create } = stub(toolUseResponse({ intent: 'spending_total' }));
    await new ClaudeAIProvider(undefined, client).generateStructured(request);

    const sent = create.mock.calls[0]?.[0];
    expect(sent.tool_choice).toEqual({ type: 'tool', name: TOOL.name });
    expect(sent.tools).toHaveLength(1);
    expect(sent.model).toBe(INTENT_MODEL);
  });

  it('frames the question as data, inside markers', async () => {
    // §45, §46 — a courtesy to the model, not the defence. The defence is the
    // closed intent union. But the framing should still actually be there.
    const { client, create } = stub(toolUseResponse({ intent: 'spending_total' }));
    await new ClaudeAIProvider(undefined, client).generateStructured(request);

    const content = create.mock.calls[0]?.[0].messages[0].content as string;
    expect(content).toContain('<question>');
    expect(content).toContain(request.user);
    expect(content).toMatch(/never instructions/i);
  });

  it('returns the tool input unvalidated, and reports usage', async () => {
    // Unvalidated on purpose: validatePlan is the only layer allowed to decide
    // what is executable. An adapter asserting a domain shape would be
    // claiming authority it does not have.
    const { client } = stub(
      toolUseResponse({ intent: 'not_a_real_intent', nonsense: 1 }),
    );
    const result = await new ClaudeAIProvider(undefined, client).generateStructured(
      request,
    );

    expect(result.output).toEqual({ intent: 'not_a_real_intent', nonsense: 1 });
    expect(result.usage.inputUnits).toBe(120);
    expect(result.usage.outputUnits).toBe(35);
    expect(result.usage.model).toBe(INTENT_MODEL);
    expect(result.usage.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('raises when the model refused', async () => {
    // A refusal is a normal 200 response, not an exception — so it has to be
    // checked for, or it reads as "no tool call" and gets a worse message.
    const { client } = stub({
      model: INTENT_MODEL,
      stop_reason: 'refusal',
      usage,
      content: [],
    });
    await expect(
      new ClaudeAIProvider(undefined, client).generateStructured(request),
    ).rejects.toMatchObject({ code: 'REFUSED' });
  });

  it('raises when no tool call came back', async () => {
    const { client } = stub({
      model: INTENT_MODEL,
      stop_reason: 'end_turn',
      usage,
      content: [{ type: 'text', text: 'I think you spent a lot.' }],
    });
    await expect(
      new ClaudeAIProvider(undefined, client).generateStructured(request),
    ).rejects.toMatchObject({ code: 'NO_OUTPUT' });
  });

  it('ignores a tool call with the wrong name', async () => {
    const { client } = stub({
      model: INTENT_MODEL,
      stop_reason: 'tool_use',
      usage,
      content: [{ type: 'tool_use', name: 'something_else', input: { intent: 'x' } }],
    });
    await expect(
      new ClaudeAIProvider(undefined, client).generateStructured(request),
    ).rejects.toMatchObject({ code: 'NO_OUTPUT' });
  });
});

describe('generateText', () => {
  const textRequest = { system: 'Explain figures.', user: 'Food: 8240.50' };

  it('joins text blocks and reports usage', async () => {
    const { client } = stub({
      model: INTENT_MODEL,
      stop_reason: 'end_turn',
      usage,
      content: [
        { type: 'text', text: 'You spent ' },
        { type: 'text', text: 'PHP 8,240.50 on food.' },
      ],
    });
    const result = await new ClaudeAIProvider(undefined, client).generateText(
      textRequest,
    );
    expect(result.text).toBe('You spent PHP 8,240.50 on food.');
    expect(result.usage.outputUnits).toBe(35);
  });

  it('raises rather than returning an empty answer', async () => {
    // An empty string rendered as an answer is a blank assistant turn the user
    // cannot distinguish from a bug — which it is.
    const { client } = stub({
      model: INTENT_MODEL,
      stop_reason: 'end_turn',
      usage,
      content: [{ type: 'text', text: '   ' }],
    });
    await expect(
      new ClaudeAIProvider(undefined, client).generateText(textRequest),
    ).rejects.toMatchObject({ code: 'NO_OUTPUT' });
  });
});

describe('SDK errors become domain errors — §56', () => {
  const cases: Array<[string, unknown, string]> = [
    [
      'rate limit',
      new Anthropic.RateLimitError(429, undefined, 'rate limited', new Headers()),
      'RATE_LIMIT',
    ],
    [
      'authentication',
      new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers()),
      'AUTH',
    ],
    [
      'timeout',
      new Anthropic.APIConnectionTimeoutError({ message: 'timed out' }),
      'TIMEOUT',
    ],
    ['anything else', new Error('socket hang up'), 'PROVIDER_ERROR'],
  ];

  for (const [label, thrown, code] of cases) {
    it(`maps ${label}`, async () => {
      const create = vi.fn().mockRejectedValue(thrown);
      const client = { messages: { create } } as unknown as Anthropic;

      await expect(
        new ClaudeAIProvider(undefined, client).generateStructured(request),
      ).rejects.toMatchObject({ code });
    });
  }

  it('never names the provider in a user-facing message', async () => {
    // §40 of Phase 09 — provider vocabulary stays out of the domain, and a
    // message telling someone "Claude is rate limited" is not something they
    // can act on anyway.
    for (const [, thrown] of cases) {
      const create = vi.fn().mockRejectedValue(thrown);
      const client = { messages: { create } } as unknown as Anthropic;
      try {
        await new ClaudeAIProvider(undefined, client).generateStructured(request);
        expect.unreachable('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(AiProviderError);
        expect((error as Error).message.toLowerCase()).not.toMatch(
          /claude|anthropic|api key/,
        );
      }
    }
  });
});
