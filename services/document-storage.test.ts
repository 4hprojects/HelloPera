import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  calls: [] as string[],
  upload: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
  download: vi.fn(),
  shrinkUpdate: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      update: () => ({
        eq: () => ({
          eq: () => ({
            select: async () => {
              m.calls.push('update');
              return m.shrinkUpdate();
            },
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/storage.service', () => ({
  uploadObject: async (p: { path: string }) => {
    m.calls.push(`upload:${p.path}`);
    return m.upload(p);
  },
  removeDocumentObjects: async (paths: string[]) => {
    m.calls.push(`remove:${paths.join(',')}`);
    return m.remove(paths);
  },
  moveObject: m.move,
  downloadObject: m.download,
  createStagedUpload: vi.fn(),
  listStaleStagedObjects: vi.fn(),
  isOwnStagedPath: (userId: string, path: string) =>
    path.startsWith(`incoming/${userId}/`),
}));

import { finalizeUpload, shrinkOriginal } from './document.service';

const ORIGINAL = 'user/2026/10/doc/original.jpg';

beforeEach(() => {
  vi.resetAllMocks();
  m.calls.length = 0;
  m.upload.mockResolvedValue(undefined);
  m.remove.mockResolvedValue(undefined);
  m.shrinkUpdate.mockResolvedValue({ data: [{ id: 'doc' }], error: null });
});

describe('shrinkOriginal', () => {
  const shrink = (jpegSize: number) =>
    shrinkOriginal({
      documentId: 'doc',
      originalPath: ORIGINAL,
      originalByteLength: 1000,
      jpeg: new Uint8Array(jpegSize),
    });

  it('writes the copy, repoints the row, then removes the original', async () => {
    await expect(shrink(300)).resolves.toBe('shrunk');
    expect(m.calls).toEqual([
      'upload:user/2026/10/doc/ocr.jpg',
      'update',
      `remove:${ORIGINAL}`,
    ]);
  });

  it('keeps the original when the saving is too small', async () => {
    await expect(shrink(800)).resolves.toBe('not_worth_it');
    expect(m.calls).toEqual([]);
  });

  it('keeps the original and drops the copy when another shrink won', async () => {
    m.shrinkUpdate.mockResolvedValue({ data: [], error: null });
    await expect(shrink(300)).resolves.toBe('failed');
    expect(m.calls).toEqual([
      'upload:user/2026/10/doc/ocr.jpg',
      'update',
      'remove:user/2026/10/doc/ocr.jpg',
    ]);
  });

  it('never throws', async () => {
    m.upload.mockRejectedValue(new Error('storage down'));
    await expect(shrink(300)).resolves.toBe('failed');
    expect(m.calls).not.toContain(`remove:${ORIGINAL}`);
  });
});

describe('finalizeUpload', () => {
  const finalize = (stagedPath: string) =>
    finalizeUpload({
      userId: 'user',
      stagedPath,
      filename: 'x.png',
      declaredMimeType: 'image/png',
      documentType: 'receipt',
    });

  it("refuses another user's staged path without touching storage", async () => {
    await expect(finalize('incoming/other/abc')).rejects.toThrow();
    expect(m.download).not.toHaveBeenCalled();
  });

  it('removes a staged file whose bytes are not a supported type', async () => {
    m.download.mockResolvedValue(new TextEncoder().encode('not an image'));
    await expect(finalize('incoming/user/abc')).rejects.toThrow(/not supported/);
    expect(m.remove).toHaveBeenCalledWith(['incoming/user/abc']);
  });
});
