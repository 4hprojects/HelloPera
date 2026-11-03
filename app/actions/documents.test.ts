import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  prepare: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/guards', () => ({
  requireUser: async () => ({ user: { id: 'user-1' }, profile: {} }),
}));
vi.mock('@/services/rate-limit.service', () => ({
  enforceRateLimit: m.rateLimit,
  RateLimitError: class extends Error {
    userMessage = 'Too many attempts. Please try again in 1 hour.';
  },
}));
vi.mock('@/services/document.service', () => ({
  prepareUpload: m.prepare,
  finalizeUpload: vi.fn(),
  archiveDocument: vi.fn(),
  UploadError: class extends Error {},
}));

import { RateLimitError } from '@/services/rate-limit.service';
import { UploadError } from '@/services/document.service';
import { prepareUploadAction } from './documents';

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
