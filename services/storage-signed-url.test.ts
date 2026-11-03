import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * HP-002: a signed URL is minted only for the document's owner. The caller's
 * role plays no part, so an admin opening someone else's document gets the
 * same null (and the route the same 404) as anyone else.
 */

const m = vi.hoisted(() => ({ doc: null as unknown, sign: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: m.doc, error: null }),
      };
      return chain;
    },
    storage: { from: () => ({ createSignedUrl: m.sign }) },
  }),
}));

import { createSignedUrl, SIGNED_URL_TTL_SECONDS } from './storage.service';

const OWNER = 'owner-id';
const ADMIN = 'admin-id';

beforeEach(() => {
  m.sign
    .mockReset()
    .mockResolvedValue({ data: { signedUrl: 'https://signed' }, error: null });
  m.doc = {
    user_id: OWNER,
    display_path: `${OWNER}/2026/11/doc/display.webp`,
    thumbnail_path: `${OWNER}/2026/11/doc/thumb.webp`,
    original_path: `${OWNER}/2026/11/doc/original.jpg`,
  };
});

describe('createSignedUrl', () => {
  it.each(['display', 'thumbnail', 'original'] as const)(
    'signs the %s rendition for its owner, for two minutes',
    async (which) => {
      await expect(
        createSignedUrl({ userId: OWNER, documentId: 'doc', which }),
      ).resolves.toBe('https://signed');
      expect(m.sign).toHaveBeenCalledWith(expect.stringContaining(OWNER), 120);
    },
  );

  it.each(['display', 'thumbnail', 'original'] as const)(
    'signs nothing for an admin who does not own the document (%s)',
    async (which) => {
      await expect(
        createSignedUrl({ userId: ADMIN, documentId: 'doc', which }),
      ).resolves.toBeNull();
      expect(m.sign).not.toHaveBeenCalled();
    },
  );

  it('signs nothing for a missing rendition', async () => {
    m.doc = { ...(m.doc as object), display_path: null };
    await expect(
      createSignedUrl({ userId: OWNER, documentId: 'doc', which: 'display' }),
    ).resolves.toBeNull();
  });

  it('keeps the lifetime short', () => {
    expect(SIGNED_URL_TTL_SECONDS).toBe(120);
  });
});
