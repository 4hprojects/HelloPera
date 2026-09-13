import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cross-user isolation — run against the REAL Supabase project.
 *
 * Skipped unless credentials are present, so `npm test` still works for
 * anyone without them. Run with:
 *
 *   npm run test:integration
 *
 * PHASE-06 §73's Security block is the one part of the phase that unit tests
 * cannot reach. The guarantee is structural — `fetchAnalyticsRows` carries no
 * `user_id` predicate at all (§60), so the boundary is entirely RLS plus the
 * JWT on the session client. That is a strong design, and it is exactly why
 * it deserves an executable assertion: if a policy is ever dropped or an
 * analytics read is quietly switched to the admin client, nothing else in the
 * suite would notice, and the failure would be one user reading another's
 * finances.
 *
 * So these tests deliberately use ANON-key clients signed in as real users.
 * An admin/service-role client bypasses RLS by design and would pass while
 * proving nothing.
 */

const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const enabled = Boolean(SECRET && URL && ANON);

const admin = enabled
  ? createClient(URL!, SECRET!, { auth: { persistSession: false } })
  : null;

/** Mirrors services/analytics.service.ts — the read under test. */
const SELECT = `
  id, type, status, direction, amount, currency_code, transaction_date,
  category_id, source_account_id, destination_account_id, merchant_name,
  refund_of_transaction_id,
  parent:refund_of_transaction_id (
    category_id, source_account_id, merchant_name, currency_code
  )
`;

const WINDOW = { from: '2026-01-01', to: '2026-12-31' };
const PASSWORD = 'isolation-test--Aa1!';

type Seeded = {
  userId: string;
  email: string;
  accountId: string;
  client: SupabaseClient;
  /** Distinctive amount so a leak is unmistakable in the assertion message. */
  amount: number;
};

const seeded: Seeded[] = [];

async function seedUser(label: string, amount: number): Promise<Seeded> {
  const email = `analytics-isolation-${label}-${crypto.randomUUID()}@hellopera.test`;

  const { data: created, error: userError } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (userError) throw userError;
  const userId = created.user.id;

  const { data: account, error: accountError } = await admin!
    .from('accounts')
    .insert({
      user_id: userId,
      name: `${label} wallet`,
      type: 'cash',
      nature: 'asset',
      currency_code: 'PHP',
    })
    .select('id')
    .single();
  if (accountError) throw accountError;

  const { error: txError } = await admin!.from('transactions').insert({
    user_id: userId,
    type: 'expense',
    direction: 'out',
    amount,
    currency_code: 'PHP',
    transaction_date: '2026-06-15',
    source_account_id: account.id,
    merchant_name: `${label} merchant`,
    status: 'confirmed',
  });
  if (txError) throw txError;

  // A genuinely RLS-scoped client: anon key + this user's own JWT.
  const client = createClient(URL!, ANON!, { auth: { persistSession: false } });
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInError) throw signInError;

  return { userId, email, accountId: account.id, client, amount };
}

/** The analytics read, exactly as the service issues it. */
async function readAnalytics(client: SupabaseClient) {
  const { data, error } = await client
    .from('transactions')
    .select(SELECT)
    .eq('status', 'confirmed')
    .gte('transaction_date', WINDOW.from)
    .lte('transaction_date', WINDOW.to)
    .order('transaction_date', { ascending: true })
    .order('id', { ascending: true });
  if (error) throw new Error(`read failed: ${error.code} ${error.message}`);
  return data ?? [];
}

describe.skipIf(!enabled)('analytics cross-user isolation — §60, §61, §73', () => {
  beforeAll(async () => {
    seeded.push(await seedUser('alpha', 1111.11));
    seeded.push(await seedUser('bravo', 2222.22));
  }, 60_000);

  afterAll(async () => {
    for (const s of seeded) {
      await s.client.auth.signOut();
      // Transactions and accounts cascade from auth.users.
      await admin!.auth.admin.deleteUser(s.userId);
    }
  });

  it('user A sees only their own transactions', async () => {
    const [alpha, bravo] = seeded as [Seeded, Seeded];
    const rows = await readAnalytics(alpha.client);

    expect(rows.length).toBeGreaterThan(0);
    const amounts = rows.map((r) => Number(r.amount));
    expect(amounts).toContain(alpha.amount);
    expect(amounts).not.toContain(bravo.amount);
  });

  it('user B sees only their own transactions', async () => {
    const [alpha, bravo] = seeded as [Seeded, Seeded];
    const rows = await readAnalytics(bravo.client);

    expect(rows.length).toBeGreaterThan(0);
    const amounts = rows.map((r) => Number(r.amount));
    expect(amounts).toContain(bravo.amount);
    expect(amounts).not.toContain(alpha.amount);
  });

  it('the two users share no transaction ids at all', async () => {
    const [alpha, bravo] = seeded as [Seeded, Seeded];
    const alphaIds = new Set((await readAnalytics(alpha.client)).map((r) => r.id));
    const bravoIds = (await readAnalytics(bravo.client)).map((r) => r.id);

    expect(bravoIds.some((id) => alphaIds.has(id))).toBe(false);
  });

  it('filtering by another user’s account id yields nothing, not their rows (§65)', async () => {
    const [alpha, bravo] = seeded as [Seeded, Seeded];

    // A forged-but-well-formed account id is the attack §65 cannot reject with
    // Zod: a UUID is valid whoever owns it. RLS must make it inert.
    const { data, error } = await alpha.client
      .from('transactions')
      .select('id, amount')
      .eq('source_account_id', bravo.accountId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('another user’s account row is not readable', async () => {
    const [alpha, bravo] = seeded as [Seeded, Seeded];

    const { data, error } = await alpha.client
      .from('accounts')
      .select('id, name, current_balance')
      .eq('id', bravo.accountId);

    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  });

  it('an anonymous client reads no transactions at all (§44)', async () => {
    const anon = createClient(URL!, ANON!, { auth: { persistSession: false } });
    const { data, error } = await anon
      .from('transactions')
      .select('id')
      .limit(5);

    // Either a policy error or an empty set is acceptable; leaked rows are not.
    expect(data ?? []).toHaveLength(0);
    if (error) expect(error.code).toBeDefined();
  });
});
