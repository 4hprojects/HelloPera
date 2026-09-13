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

/** Authenticated + active. Redirects otherwise. */
export async function requireUser(): Promise<AuthContext> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const profile = await getCurrentProfile();
  // Authenticated but no profile means the trigger did not fire. Failing
  // closed is correct: we cannot evaluate role or status without it.
  if (!profile) redirect('/auth/error?reason=no_profile');

  if (profile.status === 'suspended') redirect('/account-suspended');
  if (profile.status === 'disabled') redirect('/account-disabled');

  if (!user.email_confirmed_at) redirect('/verify-email');

  return { user, profile };
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
