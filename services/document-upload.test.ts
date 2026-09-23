import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  ready: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  process: vi.fn(),
}));
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: null }) }) }),
          }),
        }),
      }),
      insert: () => ({
        select: () => ({ single: async () => ({ data: { id: 'doc' }, error: null }) }),
      }),
      update: (value: { processing_status: string }) => ({
        eq: () =>
          value.processing_status === 'ready'
            ? m.ready()
            : Promise.resolve({ error: null }),
      }),
    }),
  }),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/services/storage.service', () => ({
  uploadObject: m.upload,
  removeDocumentObjects: m.remove,
}));
vi.mock('@/services/image-processing.service', () => ({
  hashContent: () => 'hash',
  estimatePdfPageCount: () => 1,
  processImage: m.process,
  ImageProcessingError: class extends Error {},
}));
import { uploadDocument } from './document.service';
const file = (size: number) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode('%PDF-1.7'));
  return bytes;
};
const upload = (size: number) =>
  uploadDocument({
    userId: 'user',
    bytes: file(size),
    filename: 'test.pdf',
    declaredMimeType: 'application/pdf',
    documentType: 'receipt',
  });
beforeEach(() => {
  vi.resetAllMocks();
  m.ready.mockResolvedValue({ error: null });
  m.upload.mockResolvedValue(undefined);
  m.remove.mockResolvedValue(undefined);
});
it.each([100, 2 * 1024 * 1024, 8 * 1024 * 1024])(
  'accepts a valid PDF of %i bytes',
  async (size) => {
    await expect(upload(size)).resolves.toMatchObject({ id: 'doc' });
  },
);
it('rejects oversized files before storage writes', async () => {
  await expect(upload(8 * 1024 * 1024 + 1)).rejects.toThrow();
  expect(m.upload).not.toHaveBeenCalled();
});
it('does not report success if the ready database update fails', async () => {
  m.ready.mockResolvedValue({ error: { code: 'FAULT' } });
  await expect(upload(100)).rejects.toThrow();
  expect(m.remove).toHaveBeenCalled();
});
it('cleans up after storage failure', async () => {
  m.upload.mockRejectedValue(new Error('storage unavailable'));
  await expect(upload(100)).rejects.toThrow();
  expect(m.remove).toHaveBeenCalled();
});

it('cleans up the original when image processing fails', async () => {
  m.process.mockRejectedValue(new Error('decoder failure'));
  await expect(
    uploadDocument({
      userId: 'user',
      bytes: new Uint8Array([255, 216, 255, 0]),
      filename: 'photo.jpg',
      declaredMimeType: 'image/jpeg',
      documentType: 'receipt',
    }),
  ).rejects.toThrow();
  expect(m.remove.mock.calls[0]?.[0]).toHaveLength(1);
});
it('never reports success if cleanup itself fails', async () => {
  m.ready.mockResolvedValue({ error: { code: 'FAULT' } });
  m.remove.mockRejectedValue(new Error('cleanup failure'));
  await expect(upload(100)).rejects.toThrow();
});
