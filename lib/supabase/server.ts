import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';

/**
 * Server Supabase client, scoped to the request's session.
 *
 * This is the client server actions use. It still runs as the authenticated
 * user, so RLS applies — ownership checks in application code are the first
 * layer, RLS the second.
 *
 * A service-role client is deliberately absent in Phase 00. It arrives when a
 * phase genuinely needs privileged writes, and never leaves the server.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Session refresh happens in middleware from Phase 01.
          }
        },
      },
    },
  );
}
