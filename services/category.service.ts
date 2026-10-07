import 'server-only';

import { createClient } from '@/lib/supabase/server';

export type Category = {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  is_system: boolean;
  user_id: string | null;
};

/**
 * System categories (user_id null) and the user's own, in one list.
 * RLS already restricts this to `is_system or user_id = auth.uid()`.
 */
export async function listCategories(type?: 'income' | 'expense'): Promise<Category[]> {
  const supabase = await createClient();
  let query = supabase
    .from('categories')
    .select('id, name, type, is_system, user_id')
    .eq('is_active', true)
    .order('is_system', { ascending: false })
    .order('name', { ascending: true });

  if (type) query = query.in('type', [type, 'both']);

  const { data, error } = await query.returns<Category[]>();
  if (error) throw new Error(`Could not load categories: ${error.code}`);
  return data ?? [];
}

/**
 * Guard for admin-client writes that store a category id from a form.
 *
 * The admin client bypasses RLS, so without this a user could attach another
 * user's category by pasting its id. Read through the SESSION client: the
 * categories policy already allows exactly "system or your own" — the same
 * rule the transaction and obligation database functions enforce.
 */
export async function assertCategoryUsable(
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId?.trim()) return;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('categories')
    .select('id')
    .eq('id', categoryId.trim())
    .maybeSingle();
  if (error) throw new Error(`Could not verify that category: ${error.code}`);
  if (!data) throw new Error('CATEGORY_NOT_FOUND');
}
