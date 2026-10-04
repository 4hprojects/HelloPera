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
    .from('accounts_exact')
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
    .from('accounts_exact')
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
 * where the arithmetic lives so it can be unit-tested directly. (Service modules are
 * also testable: `vitest.config.ts` aliases `server-only` to its empty stub.)
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
  const { data, error } = await admin.rpc('create_account_idempotent', {
    p_user_id: userId,
    p_request_id: input.requestId,
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

/** Loan account + details + recurring bill rule, atomically, via one RPC. */
export async function createLoanAccount(
  userId: string,
  input: CreateAccountInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_loan_account_idempotent', {
    p_user_id: userId,
    p_request_id: input.requestId,
    p_name: input.name,
    p_currency_code: input.currencyCode,
    p_opening_balance: input.openingBalance,
    p_lender: input.institutionName,
    p_payment_amount: input.paymentAmount,
    p_payment_frequency: input.paymentFrequency,
    p_next_due_date: input.nextDueDate,
    p_principal: input.principal ?? null,
    p_start_date: input.loanStartDate ?? null,
    p_interest_rate_apr: input.interestRateApr ?? null,
    p_term_months: input.termMonths ?? null,
    p_create_reminder: input.createReminder,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export type LoanDetails = {
  accountId: string;
  principal: Money | null;
  paymentAmount: Money;
  paymentFrequency: string;
  nextDueDate: string;
  interestRateApr: string | null;
  termMonths: number | null;
};

/** Loan details keyed by account id, for the accounts list. */
export async function listLoanDetails(
  accounts: readonly Account[],
): Promise<Map<string, LoanDetails>> {
  const loans = accounts.filter((a) => a.type === 'loan');
  const out = new Map<string, LoanDetails>();
  if (loans.length === 0) return out;
  const currency = new Map(loans.map((a) => [a.id, a.currency_code]));
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('loan_details_exact')
    .select('*')
    .in('account_id', [...currency.keys()]);
  if (error) throw new Error(`Could not load loan details: ${error.code}`);
  for (const r of data ?? []) {
    const cur = currency.get(r.account_id) ?? 'PHP';
    out.set(r.account_id, {
      accountId: r.account_id,
      principal: r.principal ? fromDatabase(r.principal, cur) : null,
      paymentAmount: fromDatabase(r.payment_amount, cur),
      paymentFrequency: r.payment_frequency,
      nextDueDate: r.next_due_date,
      interestRateApr: r.interest_rate_apr,
      termMonths: r.term_months,
    });
  }
  return out;
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
