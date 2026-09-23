import { afterAll, beforeAll, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
let admin: SupabaseClient;
let userId: string;
let accountId: string;
let billId: string;
beforeAll(async () => {
  if (!process.env.TEST_SUPABASE_PROJECT_REF)
    throw new Error('An isolated test project must be explicitly configured.');
  admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
  );
  const { data, error } = await admin.auth.admin.createUser({
    email: `integrity-${randomUUID()}@example.test`,
    password: randomUUID(),
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
  const account = await admin.rpc('create_account', {
    p_user_id: userId,
    p_name: 'Test wallet',
    p_type: 'cash',
    p_nature: 'asset',
    p_currency_code: 'PHP',
    p_opening_balance: 1000,
  });
  if (account.error) throw account.error;
  accountId = account.data;
  const bill = await admin
    .from('bills')
    .insert({
      user_id: userId,
      provider_name: 'Test bill',
      amount: 100,
      currency_code: 'PHP',
      due_date: '2026-09-23',
    })
    .select('id')
    .single();
  if (bill.error) throw bill.error;
  billId = bill.data.id;
});
afterAll(async () => {
  if (userId) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) throw error;
  }
});
it('concurrent duplicate submissions create exactly one payment', async () => {
  const requestId = randomUUID();
  const args = {
    p_user_id: userId,
    p_request_id: requestId,
    p_kind: 'bill',
    p_obligation_id: billId,
    p_amount: 40,
    p_account_id: accountId,
    p_date: '2026-09-23',
  };
  const results = await Promise.all(
    Array.from({ length: 5 }, () => admin.rpc('record_obligation_payment', args)),
  );
  for (const result of results) expect(result.error).toBeNull();
  expect(new Set(results.map((r) => r.data.transaction_id)).size).toBe(1);
  const { data, error } = await admin
    .from('accounts')
    .select('current_balance')
    .eq('id', accountId)
    .single();
  expect(error).toBeNull();
  expect(Number(data?.current_balance)).toBe(960);
});
it('competing payments cannot overpay or leave extra ledger entries', async () => {
  const args = {
    p_user_id: userId,
    p_kind: 'bill',
    p_obligation_id: billId,
    p_amount: 60,
    p_account_id: accountId,
    p_date: '2026-09-23',
  };
  const results = await Promise.all(
    Array.from({ length: 2 }, () =>
      admin.rpc('record_obligation_payment', { ...args, p_request_id: randomUUID() }),
    ),
  );
  expect(results.filter((r) => !r.error)).toHaveLength(1);
  const { data, error } = await admin
    .from('accounts')
    .select('current_balance')
    .eq('id', accountId)
    .single();
  expect(error).toBeNull();
  expect(Number(data?.current_balance)).toBe(900);
});
