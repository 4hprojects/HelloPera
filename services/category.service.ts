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
