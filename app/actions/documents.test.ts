import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  prepare: vi.fn(),
  del: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ user: { id: 'user-1' }, profile: {} }),
}));
vi.mock('@/lib/auth/audit', () => ({ recordAuditEvent: m.audit }));
vi.mock('@/services/rate-limit.service', () => ({
  enforceRateLimit: m.rateLimit,
  RateLimitError: class extends Error {
    userMessage = 'Too many attempts. Please try again in 1 hour.';
  },
}));
vi.mock('@/services/document.service', () => ({
  prepareUpload: m.prepare,
  finalizeUpload: vi.fn(),
  deleteDocument: m.del,
  UploadError: class extends Error {},
}));

import { RateLimitError } from '@/services/rate-limit.service';
import { UploadError } from '@/services/document.service';
import { deleteDocumentAction, prepareUploadAction } from './documents';

beforeEach(() => {
  vi.clearAllMocks();
  m.rateLimit.mockResolvedValue(undefined);
  m.prepare.mockResolvedValue({ path: 'incoming/user-1/x', token: 't' });
});

describe('prepareUploadAction', () => {
  it('counts each upload against the user and passes the size on', async () => {
    await expect(prepareUploadAction(1000)).resolves.toEqual({
      path: 'incoming/user-1/x',
      token: 't',
    });
    expect(m.rateLimit).toHaveBeenCalledWith('document_upload', 'user:user-1');
    expect(m.prepare).toHaveBeenCalledWith('user-1', 1000);
  });

  it('stages nothing once the user is over the upload limit', async () => {
    m.rateLimit.mockRejectedValue(new (RateLimitError as unknown as new () => Error)());
    await expect(prepareUploadAction(1000)).resolves.toEqual({
      error: 'Too many attempts. Please try again in 1 hour.',
    });
    expect(m.prepare).not.toHaveBeenCalled();
  });

  it('shows the quota message from the service', async () => {
    m.prepare.mockRejectedValue(new UploadError('Your document storage is full (1 GB).'));
    await expect(prepareUploadAction(1000)).resolves.toEqual({
      error: 'Your document storage is full (1 GB).',
    });
  });

  it('refuses a bad size before counting it', async () => {
    await expect(prepareUploadAction(0)).resolves.toEqual({
      error: 'Choose a file to upload.',
    });
    expect(m.rateLimit).not.toHaveBeenCalled();
  });
});

describe('deleteDocumentAction', () => {
  const ID = '00000000-0000-4000-8000-000000000001';
  const form = (id: string) => {
    const f = new FormData();
    f.set('id', id);
    return f;
  };

  it("deletes the user's document and audits it without the file name", async () => {
    m.del.mockResolvedValue({ documentType: 'receipt', bytes: 1234 });
    await expect(deleteDocumentAction({}, form(ID))).resolves.toEqual({});
    expect(m.del).toHaveBeenCalledWith('user-1', ID);
    expect(m.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: 'document_deleted',
        entityId: ID,
        metadata: { document_type: 'receipt', bytes: 1234 },
      }),
    );
  });

  it('refuses a malformed id without a lookup', async () => {
    await expect(deleteDocumentAction({}, form('nope'))).resolves.toEqual({
      error: 'That document is unavailable.',
    });
    expect(m.del).not.toHaveBeenCalled();
  });

  it("writes no audit row for a document that is not this user's", async () => {
    m.del.mockResolvedValue(null);
    await expect(deleteDocumentAction({}, form(ID))).resolves.toEqual({
      error: 'That document is unavailable.',
    });
    expect(m.audit).not.toHaveBeenCalled();
  });

  it('shows the retry message when the files could not be removed', async () => {
    m.del.mockRejectedValue(
      new UploadError('We could not delete the file. Please try again.'),
    );
    await expect(deleteDocumentAction({}, form(ID))).resolves.toEqual({
      error: 'We could not delete the file. Please try again.',
    });
    expect(m.audit).not.toHaveBeenCalled();
  });
});
