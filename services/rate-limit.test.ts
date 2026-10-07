import { beforeEach, expect, it, vi } from 'vitest';

// A plain function rather than vi.fn(): the spy records settled results and
// reports a rejected one as a test error even when the caller handled it.
const db = vi.hoisted(() => ({ rpc: async (): Promise<unknown> => ({}) }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ rpc: () => db.rpc() }),
}));
vi.mock('next/headers', () => ({ headers: async () => new Headers() }));

import { enforceRateLimit, RateLimitError } from './rate-limit.service';

const down = {
  dbError: async () => ({ data: null, error: { code: '57P01' } }),
  network: async () => {
    throw new Error('network');
  },
};

beforeEach(() => {
  db.rpc = async () => ({
    data: [{ allowed: true, retry_after_seconds: 0 }],
    error: null,
  });
});

it('blocks over the limit with the retry time from the database', async () => {
  db.rpc = async () => ({
    data: [{ allowed: false, retry_after_seconds: 540 }],
    error: null,
  });
  const error = await enforceRateLimit('login', 'a@b.c').catch((e: unknown) => e);
  expect(error).toBeInstanceOf(RateLimitError);
  expect((error as RateLimitError).userMessage).toBe(
    'Too many attempts. Please try again in about 9 minutes.',
  );
});

it.each(Object.entries(down))(
  'lets sign-in through when the limiter is down (%s)',
  async (_, fail) => {
    db.rpc = fail;
    await expect(enforceRateLimit('login', 'a@b.c')).resolves.toBeUndefined();
  },
);

it.each(
  (['ai_question', 'ocr_submit'] as const).flatMap((action) =>
    Object.entries(down).map(([how, fail]) => [action, how, fail] as const),
  ),
)(
  'refuses %s when the limiter is down (%s) — it calls a paid API',
  async (action, _, fail) => {
    db.rpc = fail;
    const error = await enforceRateLimit(action, 'user').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).userMessage).toBe(
      'This is briefly unavailable. Please try again in a minute.',
    );
  },
);
