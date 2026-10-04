import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getCurrentProfile, getCurrentUser } from '@/lib/auth/session';
import type { Profile } from '@/types/auth';

/**
 * Route guards — Phase 01 §31.
 *
 * Centralised so authorization is not re-derived per page. A page that forgets
 * to call one of these is a page with no protection, so the layouts call them
 * rather than leaving it to each route.
 */

export type AuthContext = { user: User; profile: Profile };
export type AuthFailure =
  | 'unauthenticated'
  | 'missing_profile'
  | 'suspended'
  | 'disabled'
  | 'unverified';
export type AuthResult =
  | { ok: true; context: AuthContext }
  | { ok: false; reason: AuthFailure };

/** Shared authentication/account-state decision for pages, actions and APIs. */
export async function getAuthResult(): Promise<AuthResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, reason: 'unauthenticated' };

  const profile = await getCurrentProfile();
  if (!profile) return { ok: false, reason: 'missing_profile' };
  if (profile.status === 'suspended') return { ok: false, reason: 'suspended' };
  if (profile.status === 'disabled') return { ok: false, reason: 'disabled' };
  if (!user.email_confirmed_at) return { ok: false, reason: 'unverified' };

  return { ok: true, context: { user, profile } };
}

/** Authenticated + active. Redirects otherwise. */
export async function requireUser(): Promise<AuthContext> {
  const result = await getAuthResult();
  if (result.ok) return result.context;

  switch (result.reason) {
    case 'unauthenticated':
      redirect('/login');
    case 'missing_profile':
      redirect('/auth/error?reason=no_profile');
    case 'suspended':
      redirect('/account-suspended');
    case 'disabled':
      redirect('/account-disabled');
    case 'unverified':
      redirect('/verify-email');
  }
}

/**
 * Authenticated + active + admin.
 *
 * Status is checked before role: a suspended admin is suspended (§33).
 * Admin does not bypass account status.
 */
export async function requireAdmin(): Promise<AuthContext> {
  const context = await requireUser();
  if (context.profile.role !== 'admin') redirect('/dashboard?error=forbidden');
  return context;
}

/** For auth pages — send an already-signed-in user onward. */
export async function redirectIfAuthenticated(to = '/dashboard'): Promise<void> {
  const user = await getCurrentUser();
  if (user) redirect(to);
}
