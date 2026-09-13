'use client';

import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/lib/env';

/**
 * Browser Supabase client.
 *
 * Holds the anon key only. Per the write-path rule (master plan §33), the
 * browser role has SELECT on its own rows and no INSERT/UPDATE/DELETE policy
 * on user-owned tables — every mutation goes through a server action.
 */
export function createClient() {
  return createBrowserClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
