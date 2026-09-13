import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fromDatabase, type Money } from '@/lib/money';
import {
  displayStatus,
  remaining,
  type DisplayStatus,
  type LifecycleStatus,
} from '@/lib/finance/obligation';
import type {
  CreateBillInput,
  CreateExpectedIncomeInput,
  CreateReceivableInput,
} from '@/schemas/obligation.schema';

export type ObligationKind = 'bill' | 'receivable' | 'expected_income';

const TABLE: Record<ObligationKind, string> = {
  bill: 'bills',
  receivable: 'receivables',
  expected_income: 'expected_income',
};

const LINK_TABLE: Record<ObligationKind, { table: string; fk: string }> = {
  bill: { table: 'bill_payments', fk: 'bill_id' },
  receivable: { table: 'receivable_payments', fk: 'receivable_id' },
  expected_income: { table: 'expected_income_receipts', fk: 'expected_income_id' },
};

export type Obligation = {
  id: string;
  kind: ObligationKind;
  /** provider_name / party_name / source_name, normalised. */
  name: string;
  description: string | null;
  amount: Money;
  applied: Money;
  remaining: Money;
  currency: string;
  /** due_date or expected_date. */
  date: string | null;
  lifecycle: LifecycleStatus;
  display: DisplayStatus;
  notes: string | null;
  createdAt: string;
};

type Row = Record<string, unknown>;

function nameOf(kind: ObligationKind, row: Row): string {
  const key =
    kind === 'bill'
      ? 'provider_name'
      : kind === 'receivable'
        ? 'party_name'
        : 'source_name';
  return String(row[key] ?? '');
}

function dateOf(kind: ObligationKind, row: Row): string | null {
  const key = kind === 'expected_income' ? 'expected_date' : 'due_date';
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

/**
 * Applied totals are summed from the link rows rather than stored on the
 * obligation (§10). A cached total would need invalidating on every payment,
 * unlink and void — three places to forget.
 */
export async function listObligations(
  kind: ObligationKind,
  today: string,
  options: {
    includeArchived?: boolean;
    onlyOpen?: boolean;
    /** Inclusive YYYY-MM-DD bounds on the due/expected date. */
    from?: string;
    to?: string;
  } = {},
): Promise<Obligation[]> {
  const supabase = await createClient();
  const link = LINK_TABLE[kind];
  const dateColumn = kind === 'expected_income' ? 'expected_date' : 'due_date';

  let query = supabase
    .from(TABLE[kind])
    .select(`*, ${link.table}(amount_applied)`)
    .order(dateColumn, { ascending: true })
    // Supabase caps a REST read at 1000 rows silently (see
    // services/analytics.service.ts). Obligations stay far below that in
    // practice, but an explicit bound turns a silent short read into an
    // obviously truncated list.
    .limit(1000);

  if (!options.includeArchived) query = query.eq('is_archived', false);
  if (options.onlyOpen) query = query.in('status', ['open', 'partially_paid']);
  if (options.from) query = query.gte(dateColumn, options.from);
  if (options.to) query = query.lte(dateColumn, options.to);

  const { data, error } = await query.returns<Row[]>();
  if (error) throw new Error(`Could not load ${kind}: ${error.code}`);

  return (data ?? []).map((row) => {
    const currency = String(row.currency_code ?? 'PHP');
    const links = (row[link.table] as Array<{ amount_applied: string }> | null) ?? [];
    const appliedMinor = links.reduce(
      (sum, l) => sum + fromDatabase(l.amount_applied, currency).minor,
      0n,
    );

    const amount = fromDatabase(String(row.amount), currency);
    const applied = { minor: appliedMinor, currency };
    const lifecycle = row.status as LifecycleStatus;
    const date = dateOf(kind, row);

    return {
      id: String(row.id),
      kind,
      name: nameOf(kind, row),
      description: (row.description as string) ?? null,
      amount,
      applied,
      remaining: remaining({ amount, applied }),
      currency,
      date,
      lifecycle,
      display: displayStatus(
        { status: lifecycle, amount, applied, date },
        today,
        // Expected income that did not arrive is "missed", not "overdue" —
        // nobody owes it, so nothing is late.
        { missedInsteadOfOverdue: kind === 'expected_income' },
      ),
      notes: (row.notes as string) ?? null,
      createdAt: String(row.created_at),
    };
  });
}

export async function getObligation(
  kind: ObligationKind,
  id: string,
  today: string,
): Promise<Obligation | null> {
  const all = await listObligations(kind, today, { includeArchived: true });
  return all.find((o) => o.id === id) ?? null;
}

export async function createBill(
  userId: string,
  input: CreateBillInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('bills')
    .insert({
      user_id: userId,
      provider_name: input.providerName,
      description: input.description || null,
      amount: input.amount,
      currency_code: input.currencyCode,
      due_date: input.dueDate,
      category_id: input.categoryId ?? null,
      notes: input.notes || null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function createReceivable(
  userId: string,
  input: CreateReceivableInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('receivables')
    .insert({
      user_id: userId,
      party_name: input.partyName,
      description: input.description || null,
      amount: input.amount,
      currency_code: input.currencyCode,
      due_date: input.dueDate || null,
      notes: input.notes || null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function createExpectedIncome(
  userId: string,
  input: CreateExpectedIncomeInput,
): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('expected_income')
    .insert({
      user_id: userId,
      source_name: input.sourceName,
      description: input.description || null,
      amount: input.amount,
      currency_code: input.currencyCode,
      expected_date: input.expectedDate,
      category_id: input.categoryId ?? null,
      notes: input.notes || null,
    })
    .select('id')
    .single<{ id: string }>();
  if (error) throw new Error(error.message);
  return data.id;
}

export class AllocationError extends Error {}

function friendlyAllocationError(message: string): string {
  if (message.includes('EXCEEDS_OBLIGATION_REMAINING')) {
    return 'That is more than the amount still outstanding.';
  }
  if (message.includes('EXCEEDS_TRANSACTION_AMOUNT')) {
    return 'That transaction is already fully allocated to other items.';
  }
  if (message.includes('CURRENCY_MISMATCH')) {
    return 'The transaction and this item use different currencies. HelloPera does not convert between them.';
  }
  if (message.includes('TRANSACTION_NOT_CONFIRMED'))
    return 'That transaction has been voided.';
  if (message.includes('OBLIGATION_CANCELLED')) return 'This item has been cancelled.';
  if (message.includes('OBLIGATION_NOT_FOUND')) return 'This item is unavailable.';
  if (message.includes('TRANSACTION_NOT_FOUND'))
    return 'That transaction is unavailable.';
  return 'We could not record that payment. Please try again.';
}

/** Every link row is written here. Nothing else may insert one. */
export async function allocatePayment(params: {
  userId: string;
  kind: ObligationKind;
  obligationId: string;
  transactionId: string;
  amount: string;
}): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('allocate_payment', {
    p_user_id: params.userId,
    p_obligation_type: params.kind,
    p_obligation_id: params.obligationId,
    p_transaction_id: params.transactionId,
    p_amount: params.amount,
  });
  if (error) throw new AllocationError(friendlyAllocationError(error.message));
  return data as string;
}

export async function cancelObligation(userId: string, kind: ObligationKind, id: string) {
  const admin = createAdminClient();
  const { error } = await admin
    .from(TABLE[kind])
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) throw new Error(error.message);
}
