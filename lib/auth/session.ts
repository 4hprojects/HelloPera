import 'server-only';

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/types/auth';

/**
 * Current authenticated user, or null.
 *
 * Always `getUser()`, never `getSession()`: getSession reads the cookie without
 * verifying it against the auth server, so a forged cookie would pass. getUser
 * validates the JWT. On a server that matters.
 *
 * `cache()` dedupes within a single request — a layout and three components
 * asking for the user cost one round trip.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle<Profile>();

  if (error || !data) return null;
  return data;
});

/**
 * Email verification state.
 *
 * Google OAuth users arrive already verified. Email/password users must
 * confirm before reaching anything sensitive (§14).
 */
export async function isEmailVerified(): Promise<boolean> {
  const user = await getCurrentUser();
  return Boolean(user?.email_confirmed_at);
}
