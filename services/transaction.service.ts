import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDatabase, type Money } from '@/lib/money';
import { analyticsClass } from '@/lib/finance/balance';
import type { Direction, TransactionStatus, TransactionType } from '@/lib/finance/types';
import type { CreateTransactionInput, TransactionFilter } from '@/schemas/finance.schema';

export const PAGE_SIZE = 25;

export type TransactionRow = {
  id: string;
  type: TransactionType;
  direction: Direction | null;
  amount: string;
  currency_code: string;
  transaction_date: string;
  source_account_id: string | null;
  destination_account_id: string | null;
  category_id: string | null;
  merchant_name: string | null;
  description: string | null;
  notes: string | null;
  status: TransactionStatus;
  created_at: string;
};

export type Transaction = Omit<TransactionRow, 'amount'> & {
  amount: Money;
  analytics: ReturnType<typeof analyticsClass>;
};

function toTransaction(row: TransactionRow): Transaction {
  const { amount, ...rest } = row;
  return {
    ...rest,
    amount: fromDatabase(amount, row.currency_code),
    analytics: analyticsClass(row.type, row.status),
  };
}

export async function listTransactions(filter: TransactionFilter) {
  const supabase = await createClient();
  let query = supabase.from('transactions').select('*', { count: 'exact' });

  if (filter.from) query = query.gte('transaction_date', filter.from);
  if (filter.to) query = query.lte('transaction_date', filter.to);
  if (filter.type) query = query.eq('type', filter.type);
  if (filter.categoryId) query = query.eq('category_id', filter.categoryId);
  if (filter.accountId) {
    // An account can be either side of a transaction.
    query = query.or(
      `source_account_id.eq.${filter.accountId},destination_account_id.eq.${filter.accountId}`,
    );
  }
  if (filter.search) {
    const term = filter.search.replace(/[%,()]/g, '');
    query = query.or(
      `merchant_name.ilike.%${term}%,description.ilike.%${term}%,notes.ilike.%${term}%`,
    );
  }

  switch (filter.sort) {
    case 'oldest':
      query = query.order('transaction_date', { ascending: true });
      break;
    case 'highest':
      query = query.order('amount', { ascending: false });
      break;
    case 'lowest':
      query = query.order('amount', { ascending: true });
      break;
    default:
      query = query.order('transaction_date', { ascending: false }).order('created_at', {
        ascending: false,
      });
  }

  const offset = (filter.page - 1) * PAGE_SIZE;
  const { data, error, count } = await query
    .range(offset, offset + PAGE_SIZE - 1)
    .returns<TransactionRow[]>();

  if (error) throw new Error(`Could not load transactions: ${error.code}`);

  return {
    transactions: (data ?? []).map(toTransaction),
    total: count ?? 0,
    page: filter.page,
    pageCount: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
  };
}

export async function getTransaction(id: string): Promise<Transaction | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('id', id)
    .maybeSingle<TransactionRow>();
  if (error || !data) return null;
  return toTransaction(data);
}

/**
 * Map database errors to messages a person can act on.
 * The RPCs raise stable codes precisely so this mapping is not guesswork.
 */
function friendlyError(message: string): string {
  if (message.includes('ACCOUNT_NOT_FOUND')) return 'That account is unavailable.';
  if (message.includes('ACCOUNT_ARCHIVED')) return 'That account is archived.';
  if (message.includes('CURRENCY_MISMATCH')) {
    return 'The accounts use different currencies. HelloPera does not convert between them.';
  }
  if (message.includes('CATEGORY_NOT_FOUND')) return 'That category is unavailable.';
  if (message.includes('AMOUNT_NOT_POSITIVE')) return 'Amount must be greater than zero.';
  if (message.includes('INCOME_REQUIRES_ASSET')) {
    return 'Income must go into an account you own, not one you owe on. Money arriving on a credit card is a refund or a transfer.';
  }
  if (message.includes('transactions_shape_check')) {
    return 'That combination of accounts is not valid for this transaction type.';
  }
  if (message.includes('transactions_distinct_accounts_check')) {
    return 'Choose two different accounts.';
  }
  return 'We could not save this transaction. Please try again.';
}

export class TransactionError extends Error {}

export async function createTransaction(
  userId: string,
  input: CreateTransactionInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('create_transaction', {
    p_user_id: userId,
    p_type: input.type,
    p_amount: input.amount,
    p_currency_code: input.currencyCode,
    p_transaction_date: input.transactionDate,
    p_source_account_id: input.sourceAccountId ?? null,
    p_destination_account_id: input.destinationAccountId ?? null,
    p_category_id: input.categoryId ?? null,
    p_direction: input.direction ?? null,
    p_merchant_name: input.merchantName || null,
    p_description: input.description || null,
    p_notes: input.notes || null,
    p_refund_of: input.refundOfTransactionId ?? null,
  });
  if (error) throw new TransactionError(friendlyError(error.message));
  return data as string;
}

export async function voidTransaction(userId: string, id: string, reason?: string) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('void_transaction', {
    p_user_id: userId,
    p_id: id,
    p_reason: reason || null,
  });
  if (error) throw new TransactionError(friendlyError(error.message));
}

/**
 * The newest confirmed transactions, for the dashboard — §16.
 *
 * A plain limit rather than `listTransactions`, which pages at 25 and asks
 * for an exact count: the dashboard shows five or six rows and has no use for
 * a total, and §67 says analytics should not paginate what it only samples.
 */
export async function getRecentTransactions(limit = 6): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    // §4 and §16 — official figures and lists show confirmed records only.
    .eq('status', 'confirmed')
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit)
    .returns<TransactionRow[]>();

  if (error) throw new Error(`Could not load recent transactions: ${error.code}`);
  return (data ?? []).map(toTransaction);
}
