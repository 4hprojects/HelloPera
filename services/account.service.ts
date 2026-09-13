import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { summarisePositions } from '@/lib/analytics/position';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDatabase, type Money } from '@/lib/money';
import type { AccountNature, AccountType } from '@/lib/finance/types';
import type { CreateAccountInput } from '@/schemas/finance.schema';

export type AccountRow = {
  id: string;
  name: string;
  type: AccountType;
  nature: AccountNature;
  currency_code: string;
  opening_balance: string;
  current_balance: string;
  institution_name: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
};

export type Account = Omit<AccountRow, 'current_balance' | 'opening_balance'> & {
  balance: Money;
  openingBalance: Money;
};

function toAccount(row: AccountRow): Account {
  const { current_balance, opening_balance, ...rest } = row;
  return {
    ...rest,
    // Postgres numeric arrives as a string. Parsed exactly — never via Number().
    balance: fromDatabase(current_balance, row.currency_code),
    openingBalance: fromDatabase(opening_balance, row.currency_code),
  };
}

/** Reads use the session client, so RLS applies as a second layer. */
export async function listAccounts(options: { includeArchived?: boolean } = {}) {
  const supabase = await createClient();
  let query = supabase
    .from('accounts')
    .select('*')
    .order('created_at', { ascending: true });
  if (!options.includeArchived) query = query.eq('is_archived', false);

  const { data, error } = await query.returns<AccountRow[]>();
  if (error) throw new Error(`Could not load accounts: ${error.code}`);
  return (data ?? []).map(toAccount);
}

export async function getAccount(id: string): Promise<Account | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('accounts')
    .select('*')
    .eq('id', id)
    .maybeSingle<AccountRow>();
  if (error || !data) return null;
  return toAccount(data);
}

/**
 * Totals per currency.
 *
 * Thin wrapper over `lib/analytics/position.summarisePositions`, which is
 * where the arithmetic lives so it can be unit-tested — anything under
 * `services/` imports `server-only` and cannot be reached from a test.
 *
 * Note the default: this includes archived accounts, because the accounts
 * page shows them. The dashboard calls `summarisePositions` directly and
 * excludes them, per §9 and §47.
 */
export function summarise(accounts: readonly Account[]) {
  return summarisePositions(
    accounts.map((a) => ({
      nature: a.nature,
      currency: a.currency_code,
      balance: a.balance,
      isArchived: a.is_archived,
    })),
    { includeArchived: true },
  );
}

/** Writes go through the RPC so the account and its opening entry are atomic. */
export async function createAccount(
  userId: string,
  input: CreateAccountInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_account', {
    p_user_id: userId,
    p_name: input.name,
    p_type: input.type,
    p_nature: input.nature,
    p_currency_code: input.currencyCode,
    p_opening_balance: input.openingBalance || '0',
    p_institution_name: input.institutionName || null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function archiveAccount(userId: string, id: string, archived: boolean) {
  const admin = createAdminClient();
  const { error } = await admin
    .from('accounts')
    .update({ is_archived: archived })
    .eq('id', id)
    .eq('user_id', userId); // ownership in the predicate, never from the form
  if (error) throw new Error(error.message);
}
