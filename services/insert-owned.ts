import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Optional caller-chosen id for a create.
 *
 * A retry that sends the same id lands on the row the first attempt made,
 * instead of a second record. The document draft flow derives one per draft;
 * the expected-income forms send one per submission.
 */
export type CreateOptions = { id?: string };

/**
 * Insert one owned row and return its id, and whether this call created it.
 *
 * With `id`, a unique violation on a row this user already owns under that id
 * is the same request arriving twice, so the existing id is returned with
 * `created: false`. Any other failure, including that id belonging to someone
 * else, is an error.
 */
export async function insertOwned(
  table: string,
  userId: string,
  row: Record<string, unknown>,
  id: string | undefined,
): Promise<{ id: string; created: boolean }> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(table)
    .insert({ ...(id ? { id } : {}), user_id: userId, ...row })
    .select('id')
    .single<{ id: string }>();
  if (!error) return { id: data.id, created: true };
  if (id && error.code === '23505') {
    const { data: existing } = await admin
      .from(table)
      .select('id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle<{ id: string }>();
    if (existing) return { id: existing.id, created: false };
  }
  throw new Error(error.message);
}
