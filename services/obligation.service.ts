import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { assertCategoryUsable } from '@/services/category.service';
import { fromDatabase, parseDecimal, toDecimalString, type Money } from '@/lib/money';
import {
  displayStatus,
  installmentProgress,
  remaining,
  type DisplayStatus,
  type LifecycleStatus,
} from '@/lib/finance/obligation';
import type {
  RecordPaymentInput,
  UpdateObligationInput,
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
  categoryId: string | null;
  /** Receivables only: when the money was lent. */
  borrowedDate: string | null;
  /** Bills only: monthly payment and number of months, when set. */
  installment: { amount: Money; count: number; prior: number } | null;
  /** Whole installments covered by recorded payments. */
  paymentsMade: number;
  /** Expected income only: the recurring rule that generated this record. */
  recurringRuleId: string | null;
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
  const { data, error } = await supabase.rpc('read_obligations', {
    p_kind: kind,
    p_archived: options.includeArchived ?? false,
    p_open: options.onlyOpen ?? false,
    p_from: options.from ?? null,
    p_to: options.to ?? null,
  });
  if (error)
    throw new Error('Your complete totals could not be loaded. Please try again.');
  return ((data as Row[]) ?? []).map((row) => toObligation(kind, today, row));
}

function toObligation(kind: ObligationKind, today: string, row: Row): Obligation {
  const link = LINK_TABLE[kind];
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
  const installment =
    row.installment_amount != null && row.installment_count != null
      ? {
          amount: fromDatabase(String(row.installment_amount), currency),
          count: Number(row.installment_count),
          prior: Number(row.installments_prior ?? 0),
        }
      : null;

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
    categoryId: (row.category_id as string) ?? null,
    borrowedDate: (row.borrowed_date as string) ?? null,
    installment,
    paymentsMade: installment
      ? installmentProgress(
          applied,
          installment.amount,
          installment.count,
          installment.prior,
        )
      : 0,
    recurringRuleId: (row.recurring_rule_id as string) ?? null,
    createdAt: String(row.created_at),
  };
}

export async function getObligation(
  kind: ObligationKind,
  id: string,
  today: string,
): Promise<Obligation | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('read_obligations', {
    p_kind: kind,
    p_archived: true,
    p_id: id,
  });
  if (error) throw new Error('This item could not be loaded. Please try again.');
  const row = (data as Row[] | null)?.[0];
  return row ? toObligation(kind, today, row) : null;
}

export class ObligationEditError extends Error {}

function obligationEditMessage(message: string): string {
  if (message.includes('OBLIGATION_NOT_FOUND')) return 'That item no longer exists.';
  if (message.includes('OBLIGATION_CANCELLED'))
    return 'A cancelled item cannot be edited.';
  if (message.includes('AMOUNT_BELOW_APPLIED')) {
    return 'The amount cannot be less than what is already recorded against it.';
  }
  if (message.includes('CATEGORY_NOT_FOUND')) return 'That category is unavailable.';
  if (message.includes('DATE_BEFORE_BORROWED')) {
    return 'The expected date cannot be before the date borrowed.';
  }
  if (message.includes('INSTALLMENT_INVALID')) {
    return 'Enter both a monthly payment (no more than the total) and 2 to 600 months. Payments already made cannot exceed the months.';
  }
  return 'We could not save these changes. Please try again.';
}

export async function updateObligation(
  userId: string,
  kind: ObligationKind,
  input: UpdateObligationInput,
) {
  const admin = createAdminClient();
  const { error } = await admin.rpc('update_obligation', {
    p_user_id: userId,
    p_kind: kind,
    p_id: input.id,
    p_name: input.name,
    p_amount: input.amount,
    p_date: input.date || null,
    p_description: input.description || null,
    p_notes: input.notes || null,
    p_category_id: input.categoryId ?? null,
    p_installment_amount: input.installmentAmount ?? null,
    p_installment_count: input.installmentCount ?? null,
    p_installments_prior: input.installmentsPrior ?? 0,
    p_borrowed_date: input.borrowedDate || null,
  });
  if (error) throw new ObligationEditError(obligationEditMessage(error.message));
}

/**
 * "This and all later pay dates" — carry an edit forward to a repeating income.
 *
 * Updates the rule (so dates generated from now on use the new figures) and the
 * later records that are still untouched. `status = 'open'` is the guard:
 * anything partly or fully received, cancelled or archived is left alone, as is
 * every earlier date. Dates are never shifted — a date change stays on the one
 * record. `rebuildFutureOccurrences` cannot do this job because it only
 * regenerates `expected_events`, never `expected_income`.
 */
export async function updateFutureExpectedIncome(
  userId: string,
  ruleId: string,
  afterDate: string,
  fields: {
    name: string;
    amount: string;
    description: string;
    categoryId: string | null;
  },
): Promise<void> {
  const admin = createAdminClient();
  const amount = toDecimalString(parseDecimal(fields.amount));

  const rule = await admin
    .from('recurring_rules')
    .update({
      name: fields.name,
      source_name: fields.name,
      amount,
      description: fields.description || null,
      category_id: fields.categoryId,
    })
    .eq('id', ruleId)
    .eq('user_id', userId);
  if (rule.error) throw new Error(`Could not update the rule: ${rule.error.code}`);

  const rows = await admin
    .from('expected_income')
    .update({
      source_name: fields.name,
      amount,
      description: fields.description || null,
      category_id: fields.categoryId,
    })
    .eq('user_id', userId)
    .eq('recurring_rule_id', ruleId)
    .eq('status', 'open')
    .eq('is_archived', false)
    .gt('expected_date', afterDate);
  if (rows.error) throw new Error(`Could not update later dates: ${rows.error.code}`);
}

/**
 * Attach an existing one-off record to a freshly created rule, as that rule's
 * occurrence on this date. Done before generation so the unique
 * (recurring_rule_id, occurrence_date) index makes the generator skip the date
 * instead of creating a duplicate beside it.
 */
export async function linkExpectedIncomeToRule(
  userId: string,
  id: string,
  ruleId: string,
  date: string,
): Promise<void> {
  const admin = createAdminClient();
  const { error } = await admin
    .from('expected_income')
    .update({ recurring_rule_id: ruleId, occurrence_date: date })
    .eq('id', id)
    .eq('user_id', userId)
    .is('recurring_rule_id', null);
  if (error) throw new Error(`Could not link this record to its rule: ${error.code}`);
}

export async function createBill(
  userId: string,
  input: CreateBillInput,
): Promise<string> {
  await assertCategoryUsable(input.categoryId);
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
      installment_amount: input.installmentAmount ?? null,
      installment_count: input.installmentCount ?? null,
      installments_prior: input.installmentsPrior ?? 0,
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
      borrowed_date: input.borrowedDate || null,
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
  await assertCategoryUsable(input.categoryId);
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
  if (message.includes('REQUEST_ALREADY_USED'))
    return 'This form already recorded a different payment. Reload the page to start another.';
  if (message.includes('TRANSACTION_DIRECTION_MISMATCH'))
    return 'Choose an expense for a bill, or income for money received.';
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

/** False when no row of the caller's matched: someone else's id, or none. */
export async function cancelObligation(
  userId: string,
  kind: ObligationKind,
  id: string,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from(TABLE[kind])
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .select('id');
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function recordObligationPayment(userId: string, input: RecordPaymentInput) {
  const { data, error } = await createAdminClient().rpc('record_obligation_payment', {
    p_user_id: userId,
    p_request_id: input.requestId,
    p_kind: input.obligationType,
    p_obligation_id: input.obligationId,
    p_amount: toDecimalString(parseDecimal(input.amount)),
    p_account_id: input.mode === 'new' ? input.accountId : null,
    p_date: input.mode === 'new' ? input.transactionDate : null,
    p_transaction_id: input.mode === 'existing' ? input.transactionId : null,
  });
  if (error) throw new AllocationError(friendlyAllocationError(error.message));
  return data as { transaction_id: string; allocation_id: string };
}

/** Display pages are bounded independently of the complete totals read. */
export async function listObligationPage(
  kind: ObligationKind,
  today: string,
  page: number,
) {
  const supabase = await createClient();
  const offset = (page - 1) * 25;
  const { data, error } = await supabase.rpc('read_obligations', {
    p_kind: kind,
    p_offset: offset,
    p_limit: 26,
  });
  if (error) throw new Error('These items could not be loaded. Please try again.');
  const rows = (data ?? []) as Row[];
  return {
    items: rows.slice(0, 25).map((row) => toObligation(kind, today, row)),
    hasNext: rows.length > 25,
  };
}

export type PaymentCandidate = {
  id: string;
  date: string;
  amount: string;
  remaining: string;
  label: string;
};

const CANDIDATE_PAGE = 25;

/**
 * Confirmed transactions that can still be linked to an item, newest first,
 * each with the amount left to allocate. Fully allocated transactions are not
 * returned, so the picker cannot offer a link the database would refuse.
 * Keyset-paginated: `cursor` is the previous page's `next`.
 */
export async function listPaymentCandidates(params: {
  kind: ObligationKind;
  currency: string;
  search?: string;
  cursor?: string | null;
}): Promise<{ items: PaymentCandidate[]; next: string | null }> {
  const [afterDate, afterId] = (params.cursor ?? '').split('|');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('list_payment_candidates', {
    p_type: params.kind === 'bill' ? 'expense' : 'income',
    p_currency: params.currency,
    p_search: params.search?.trim().slice(0, 80) || null,
    p_after_date: afterDate || null,
    p_after_id: afterId || null,
    p_limit: CANDIDATE_PAGE + 1,
  });
  if (error) throw new Error(`Could not load transactions: ${error.code}`);

  const rows = (data ?? []) as Array<{
    id: string;
    transaction_date: string;
    amount: string;
    description: string | null;
    merchant_name: string | null;
    remaining: string;
  }>;
  const page = rows.slice(0, CANDIDATE_PAGE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => {
      const name = r.merchant_name || r.description;
      return {
        id: r.id,
        date: r.transaction_date,
        amount: r.amount,
        remaining: r.remaining,
        label: `${r.transaction_date} · ${params.currency} ${r.amount}${
          r.remaining !== r.amount ? ` (${r.remaining} left)` : ''
        }${name ? ` · ${name}` : ''}`,
      };
    }),
    next:
      rows.length > CANDIDATE_PAGE && last ? `${last.transaction_date}|${last.id}` : null,
  };
}
