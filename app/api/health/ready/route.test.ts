import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ calls: 0, dbError: null as unknown }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock('@/services/storage.service', () => ({ BUCKET: 'hello-pera-documents' }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    m.calls++;
    return {
      from: () => ({
        select: () => Promise.resolve({ error: m.dbError }),
      }),
      storage: { from: () => ({ list: async () => ({ error: null }) }) },
    };
  },
}));

beforeEach(() => {
  vi.resetModules();
  m.calls = 0;
  m.dbError = null;
});

describe('GET /api/health/ready', () => {
  it('reports ready and never lets the answer be cached', async () => {
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ready', database: true, storage: true });
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('checks the backend once for a burst of callers', async () => {
    const { GET } = await import('./route');
    await Promise.all(Array.from({ length: 50 }, () => GET(new Request('http://x'))));
    expect(m.calls).toBe(1);
  });

  it('reports which dependency failed, with 503', async () => {
    m.dbError = { code: '57P01' };
    const { GET } = await import('./route');
    const res = await GET(new Request('http://x'));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      status: 'not_ready',
      database: false,
      storage: true,
    });
  });
});
