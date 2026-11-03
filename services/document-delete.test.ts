import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  calls: [] as string[],
  row: null as unknown,
  removeUnder: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: m.row, error: null }),
        delete: () => {
          m.calls.push('delete row');
          const del = {
            eq: () => del,
            then: (r: (v: unknown) => unknown) => r({ error: null }),
          };
          return del;
        },
      };
      return chain;
    },
  }),
}));
vi.mock('@/services/storage.service', () => ({
  removeObjectsUnder: async (folder: string, paths: unknown[]) => {
    m.calls.push(`remove ${folder}`);
    return m.removeUnder(folder, paths);
  },
  removeDocumentObjects: vi.fn(),
  storageUsedBytes: vi.fn(),
  uploadObject: vi.fn(),
  moveObject: vi.fn(),
  downloadObject: vi.fn(),
  createStagedUpload: vi.fn(),
  listStaleStagedObjects: vi.fn(),
  isOwnStagedPath: vi.fn(),
}));

import { deleteDocument } from './document.service';

const FOLDER = 'user-1/2026/11/doc-1';

beforeEach(() => {
  m.calls.length = 0;
  m.removeUnder.mockReset().mockResolvedValue(undefined);
  m.row = {
    original_path: `${FOLDER}/ocr.jpg`,
    display_path: `${FOLDER}/display.webp`,
    thumbnail_path: `${FOLDER}/thumb.webp`,
    document_type: 'receipt',
    original_size_bytes: 5000,
  };
});

describe('deleteDocument', () => {
  it('removes every file in the document folder, then the row', async () => {
    await expect(deleteDocument('user-1', 'doc-1')).resolves.toEqual({
      documentType: 'receipt',
      bytes: 5000,
    });
    expect(m.calls).toEqual([`remove ${FOLDER}`, 'delete row']);
    expect(m.removeUnder.mock.calls[0]?.[1]).toEqual([
      `${FOLDER}/ocr.jpg`,
      `${FOLDER}/display.webp`,
      `${FOLDER}/thumb.webp`,
    ]);
  });

  it('keeps the row when the files could not be removed, so a retry works', async () => {
    m.removeUnder.mockRejectedValue(new Error('storage down'));
    await expect(deleteDocument('user-1', 'doc-1')).rejects.toThrow(/could not delete/);
    expect(m.calls).toEqual([`remove ${FOLDER}`]);
  });

  it('returns null for a document this user does not have', async () => {
    m.row = null;
    await expect(deleteDocument('user-1', 'doc-1')).resolves.toBeNull();
    expect(m.calls).toEqual([]);
  });
});
