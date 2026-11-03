import { beforeEach, describe, expect, it, vi } from 'vitest';

/** HP-038: a file that cannot be shrunk must not hold the sweep's batch forever. */

const m = vi.hoisted(() => ({
  rows: [] as Array<{ id: string; original_path: string }>,
  filters: [] as string[],
  updates: [] as Array<{ id: unknown; patch: Record<string, unknown> }>,
  download: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/log', () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const read: Record<string, unknown> = {};
      for (const k of ['select', 'eq', 'in', 'not', 'lt', 'order', 'limit'])
        read[k] = () => read;
      read.or = (filter: string) => {
        m.filters.push(filter);
        return read;
      };
      read.returns = async () => ({ data: m.rows, error: null });
      read.update = (patch: Record<string, unknown>) => ({
        eq: async (_column: string, id: unknown) => {
          m.updates.push({ id, patch });
          return { error: null };
        },
      });
      return read;
    },
  }),
}));
vi.mock('@/services/storage.service', () => ({
  downloadObject: m.download,
  listStaleStagedObjects: async () => [],
  removeDocumentObjects: vi.fn(),
  removeObjectsUnder: vi.fn(),
  storageUsedBytes: vi.fn(),
  uploadObject: vi.fn(),
  moveObject: vi.fn(),
  createStagedUpload: vi.fn(),
  isOwnStagedPath: vi.fn(),
}));

import { sweepDocumentStorage } from './document.service';

beforeEach(() => {
  m.filters.length = 0;
  m.updates.length = 0;
  m.rows = [{ id: 'bad', original_path: 'u/2026/11/bad/original.jpg' }];
  m.download.mockReset().mockRejectedValue(new Error('corrupt'));
});

describe('sweepDocumentStorage', () => {
  it('stamps a document whose shrink failed', async () => {
    await expect(sweepDocumentStorage()).resolves.toEqual({
      shrunk: 0,
      staleUploadsRemoved: 0,
    });
    expect(m.updates).toHaveLength(1);
    expect(m.updates[0]?.id).toBe('bad');
    expect(m.updates[0]?.patch).toHaveProperty('shrink_failed_at');
  });

  it('only picks documents never failed, or failed over a week ago', async () => {
    m.rows = [];
    await sweepDocumentStorage();
    const filter = m.filters[0] ?? '';
    expect(filter).toMatch(/^shrink_failed_at\.is\.null,shrink_failed_at\.lt\./);
    const before = Date.parse(filter.split('shrink_failed_at.lt.')[1] ?? '');
    expect(Date.now() - before).toBeGreaterThanOrEqual(7 * 86_400_000 - 1000);
  });
});
