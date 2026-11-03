import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ auth: null as unknown, signed: vi.fn() }));

vi.mock('@/lib/auth/guards', () => ({ getAuthResult: async () => m.auth }));
vi.mock('@/services/storage.service', () => ({ createSignedUrl: m.signed }));

import { GET } from './route';

const ID = '00000000-0000-4000-8000-000000000001';
const get = (id: string, which: string) =>
  GET(new Request('http://x'), { params: Promise.resolve({ id, which }) });

beforeEach(() => {
  vi.clearAllMocks();
  m.auth = { ok: true, context: { user: { id: 'user-1' } } };
  m.signed.mockResolvedValue('https://storage.example/signed');
});

describe('GET /api/documents/[id]/[which]', () => {
  it('redirects the owner to a signed URL, never cached', async () => {
    const res = await get(ID, 'display');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://storage.example/signed');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(m.signed).toHaveBeenCalledWith({
      userId: 'user-1',
      documentId: ID,
      which: 'display',
    });
  });

  it('sends no-store on 401 and 403', async () => {
    m.auth = { ok: false, reason: 'unauthenticated' };
    const unauth = await get(ID, 'display');
    expect(unauth.status).toBe(401);
    expect(unauth.headers.get('cache-control')).toBe('private, no-store');

    m.auth = { ok: false, reason: 'suspended' };
    const forbidden = await get(ID, 'display');
    expect(forbidden.status).toBe(403);
    expect(forbidden.headers.get('cache-control')).toBe('private, no-store');
    expect(m.signed).not.toHaveBeenCalled();
  });

  it('answers 404 for a malformed id or rendition without a lookup', async () => {
    const cases: [string, string][] = [
      ['not-a-uuid', 'display'],
      [`${ID}'--`, 'display'],
      [ID, 'raw'],
    ];
    for (const [id, which] of cases) {
      const res = await get(id, which);
      expect(res.status, `${id}/${which}`).toBe(404);
    }
    expect(m.signed).not.toHaveBeenCalled();
  });

  it("answers the same 404 for another user's document", async () => {
    m.signed.mockResolvedValue(null);
    const res = await get(ID, 'original');
    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });
});
