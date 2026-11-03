import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  auth: null as unknown,
  rateLimit: vi.fn(),
  build: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/guards', () => ({ getAuthResult: async () => m.auth }));
vi.mock('@/services/rate-limit.service', () => ({
  enforceRateLimit: m.rateLimit,
  RateLimitError: class extends Error {
    retryAfterSeconds = 1200;
    userMessage = 'Too many attempts. Please try again in 20 minutes.';
  },
}));
vi.mock('@/services/export.service', () => ({
  ExportError: class extends Error {},
  buildExport: m.build,
  toCsvExport: () => 'a,b',
  toJsonExport: () => '{}',
}));

import { RateLimitError } from '@/services/rate-limit.service';
import { GET } from './route';

const get = (format = 'json') => GET(new Request(`http://x/api/export?format=${format}`));

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { ok: true, context: { user: { id: 'user-1' } } };
  m.rateLimit.mockResolvedValue(undefined);
  m.build.mockResolvedValue({});
});

describe('GET /api/export', () => {
  it('counts each export against the user', async () => {
    const res = await get('csv');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(m.rateLimit).toHaveBeenCalledWith('data_export', 'user:user-1');
  });

  it('answers 429 with Retry-After and builds nothing over the limit', async () => {
    m.rateLimit.mockRejectedValue(new (RateLimitError as unknown as new () => Error)());
    const res = await get();
    expect(res.status).toBe(429);
    expect(res.headers.get('retry-after')).toBe('1200');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(m.build).not.toHaveBeenCalled();
  });

  it('refuses a signed-out caller before counting or building', async () => {
    m.auth = { ok: false, reason: 'unauthenticated' };
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(m.rateLimit).not.toHaveBeenCalled();
    expect(m.build).not.toHaveBeenCalled();
  });
});
