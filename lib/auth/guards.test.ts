import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@/types/auth';

const { getCurrentProfile, getCurrentUser, redirect } = vi.hoisted(() => ({
  getCurrentProfile: vi.fn(),
  getCurrentUser: vi.fn(),
  redirect: vi.fn((destination: string): never => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));

vi.mock('@/lib/auth/session', () => ({ getCurrentProfile, getCurrentUser }));
vi.mock('next/navigation', () => ({ redirect }));

import { redirectIfAuthenticated, requireAdmin, requireUser } from '@/lib/auth/guards';

const USER = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'person@example.com',
  email_confirmed_at: '2026-09-20T00:00:00.000Z',
} as User;

const PROFILE = {
  id: USER.id,
  email: USER.email,
  full_name: 'Test Person',
  role: 'user',
  status: 'active',
} as Profile;

describe('requireUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(USER);
    getCurrentProfile.mockResolvedValue(PROFILE);
  });

  it('redirects a signed-out request to login', async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('REDIRECT:/login');
    expect(getCurrentProfile).not.toHaveBeenCalled();
  });

  it('fails closed when an authenticated user has no profile', async () => {
    getCurrentProfile.mockResolvedValue(null);

    await expect(requireUser()).rejects.toThrow('REDIRECT:/auth/error?reason=no_profile');
  });

  it.each([
    ['suspended', '/account-suspended'],
    ['disabled', '/account-disabled'],
  ] as const)('redirects a %s account', async (status, destination) => {
    getCurrentProfile.mockResolvedValue({ ...PROFILE, status });

    await expect(requireUser()).rejects.toThrow(`REDIRECT:${destination}`);
  });

  it('requires email confirmation', async () => {
    getCurrentUser.mockResolvedValue({ ...USER, email_confirmed_at: undefined });

    await expect(requireUser()).rejects.toThrow('REDIRECT:/verify-email');
  });

  it('returns the active user and profile', async () => {
    await expect(requireUser()).resolves.toEqual({ user: USER, profile: PROFILE });
  });
});

describe('requireAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getCurrentUser.mockResolvedValue(USER);
    getCurrentProfile.mockResolvedValue(PROFILE);
  });

  it('redirects a regular user away from admin routes', async () => {
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/dashboard?error=forbidden');
  });

  it('returns an active administrator', async () => {
    const admin = { ...PROFILE, role: 'admin' as const };
    getCurrentProfile.mockResolvedValue(admin);

    await expect(requireAdmin()).resolves.toEqual({ user: USER, profile: admin });
  });
});

describe('redirectIfAuthenticated', () => {
  beforeEach(() => vi.clearAllMocks());

  it('redirects an authenticated user to the requested destination', async () => {
    getCurrentUser.mockResolvedValue(USER);

    await expect(redirectIfAuthenticated('/settings')).rejects.toThrow(
      'REDIRECT:/settings',
    );
  });

  it('leaves a signed-out visitor on the auth page', async () => {
    getCurrentUser.mockResolvedValue(null);

    await expect(redirectIfAuthenticated()).resolves.toBeUndefined();
    expect(redirect).not.toHaveBeenCalled();
  });
});
