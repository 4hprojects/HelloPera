import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { env, requireServiceRoleKey } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS.
 *
 * The `server-only` import makes a client-component import a build error
 * rather than a runtime leak — this key grants unrestricted database access.
 *
 * Every caller must check ownership before writing. RLS is not a backstop
 * here; it is switched off for this client by design.
 */
export function createAdminClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, requireServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
