import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  calls: [] as string[],
  upload: vi.fn(),
  remove: vi.fn(),
  move: vi.fn(),
  download: vi.fn(),
  shrinkUpdate: vi.fn(),
  used: vi.fn(),
  stage: vi.fn(),
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
  createStagedUpload: m.stage,
  storageUsedBytes: m.used,
  listStaleStagedObjects: vi.fn(),
  isOwnStagedPath: (userId: string, path: string) =>
    path.startsWith(`incoming/${userId}/`),
}));

import { MAX_STORAGE_BYTES } from '@/lib/documents/validation';
import {
  finalizeUpload,
  prepareUpload,
  shrinkOriginal,
  STORAGE_FULL_MESSAGE,
} from './document.service';

const ORIGINAL = 'user/2026/10/doc/original.jpg';

beforeEach(() => {
  vi.resetAllMocks();
  m.calls.length = 0;
  m.upload.mockResolvedValue(undefined);
  m.remove.mockResolvedValue(undefined);
  m.shrinkUpdate.mockResolvedValue({ data: [{ id: 'doc' }], error: null });
  m.used.mockResolvedValue(0);
  m.stage.mockResolvedValue({ path: 'incoming/user/abc', token: 't' });
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

  it('removes a staged file that takes the user over the quota', async () => {
    m.download.mockResolvedValue(new Uint8Array(10));
    m.used.mockResolvedValue(MAX_STORAGE_BYTES + 1);
    await expect(finalize('incoming/user/abc')).rejects.toThrow(STORAGE_FULL_MESSAGE);
    expect(m.remove).toHaveBeenCalledWith(['incoming/user/abc']);
    expect(m.upload).not.toHaveBeenCalled();
  });

  it('removes a staged file whose bytes are not a supported type', async () => {
    m.download.mockResolvedValue(new TextEncoder().encode('not an image'));
    await expect(finalize('incoming/user/abc')).rejects.toThrow(/not supported/);
    expect(m.remove).toHaveBeenCalledWith(['incoming/user/abc']);
  });
});

describe('prepareUpload', () => {
  it('stages an upload that fits in the quota', async () => {
    m.used.mockResolvedValue(MAX_STORAGE_BYTES - 100);
    await expect(prepareUpload('user', 100)).resolves.toEqual({
      path: 'incoming/user/abc',
      token: 't',
    });
  });

  it('refuses an upload that would pass the quota, before staging it', async () => {
    m.used.mockResolvedValue(MAX_STORAGE_BYTES - 100);
    await expect(prepareUpload('user', 101)).rejects.toThrow(STORAGE_FULL_MESSAGE);
    expect(m.stage).not.toHaveBeenCalled();
  });

  it('refuses to stage when usage cannot be read', async () => {
    m.used.mockRejectedValue(new Error('rpc down'));
    await expect(prepareUpload('user', 1)).rejects.toThrow(/could not start/);
    expect(m.stage).not.toHaveBeenCalled();
  });
});
