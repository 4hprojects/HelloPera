// @ts-expect-error Shared operational ESM guard.
import { assertStagingIdentity } from '../scripts/staging-identity.mjs';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';

/**
 * Cross-user isolation, end to end: user A owns records, user B attacks them.
 *
 * B attacks through every door a real user has, with a real session:
 *
 *  1. The Supabase data API and storage API, with B's own JWT — what anyone
 *     holding the public anon key and a login can call directly.
 *  2. The app over HTTP, with B's session cookie — pages and routes.
 *  3. The app's server actions, run in-process as B. Nothing is mocked but
 *     the Next request context (cookies, revalidation): the guards, services,
 *     RLS and database are real.
 *
 * Where HTTP status applies the attempt must be 403 or 404. Two layers do not
 * speak in status codes, so the assertion there is about effect instead:
 *  - a data API read of a row hidden by RLS is 200 with an empty list;
 *  - a server action always answers 200 with its own result object.
 * For both, the test requires that nothing of A's is returned and that every
 * one of A's rows is byte-for-byte unchanged afterwards.
 *
 * Control requests as A prove each refusal is about ownership, not a missing
 * record. Run with `npm run test:integration` against a non-production project.
 */

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const SECRET = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
const APP = process.env.E2E_BASE_URL ?? 'http://localhost:3030';
const BUCKET = 'hello-pera-documents';
const PASSWORD = 'cross-user-test--Aa1!';
const enabled = Boolean(process.env.HELLOPERA_INTEGRATION && URL_ && ANON && SECRET);

// ---------------------------------------------------------------------------
// Next request context for in-process server actions: the acting user's
// cookies, and no-op revalidation. Everything below the action is real.
// ---------------------------------------------------------------------------
type Jar = Map<string, string>;
const ctx = vi.hoisted(() => ({ jar: new Map<string, string>() }));
vi.mock('next/headers', () => ({
  cookies: async () => ({
    getAll: () => [...ctx.jar].map(([name, value]) => ({ name, value })),
    get: (name: string) =>
      ctx.jar.has(name) ? { name, value: ctx.jar.get(name)! } : undefined,
    set: () => {},
  }),
  headers: async () => new Headers(),
}));
vi.mock('next/cache', () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  },
  notFound: () => {
    throw new Error('NEXT_NOT_FOUND');
  },
}));

const admin = enabled
  ? createClient(URL_, SECRET!, { auth: { persistSession: false } })
  : null;

type User = { id: string; email: string; token: string; jar: Jar; cookie: string };
type Owned = {
  account: string;
  transaction: string;
  bill: string;
  document: string;
  path: string;
};

let A: User;
let B: User;
/** Every auth user this run created, recorded before anything can fail. */
const created: string[] = [];
let owned: Owned;
let before: Record<string, unknown>;

type Row = {
  layer: string;
  attempt: string;
  expected: string;
  actual: string;
  ok: boolean;
};
const results: Row[] = [];
function record(row: Row) {
  results.push(row);
  return row;
}

async function createUser(label: string): Promise<User> {
  const email = `cross-user-${label}-${crypto.randomUUID()}@hellopera.test`;
  const { data, error } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  created.push(data.user.id);

  // Sign in through @supabase/ssr so the cookies are the app's real format.
  // Password sign-in is behind CAPTCHA on this project, so the session comes
  // from an admin-issued magic link, verified here — the same session a
  // person gets from clicking it. CAPTCHA guards requesting a sign-in, not
  // verifying one.
  const { data: link, error: linkError } = await admin!.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (linkError) throw linkError;
  const jar: Jar = new Map();
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (list) =>
        list.forEach(({ name, value }) =>
          value ? jar.set(name, value) : jar.delete(name),
        ),
    },
  });
  const { data: session, error: signInError } = await ssr.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: 'magiclink',
  });
  if (signInError) throw signInError;

  return {
    id: data.user.id,
    email,
    token: session.session!.access_token,
    jar,
    cookie: [...jar].map(([name, value]) => `${name}=${value}`).join('; '),
  };
}

async function seed(owner: User): Promise<Owned> {
  const one = async (table: string, row: Record<string, unknown>) => {
    const { data, error } = await admin!.from(table).insert(row).select('id').single();
    if (error) throw new Error(`seed ${table}: ${error.message}`);
    return String(data.id);
  };
  const account = await one('accounts', {
    user_id: owner.id,
    name: 'A wallet',
    type: 'cash',
    nature: 'asset',
    currency_code: 'PHP',
  });
  const transaction = await one('transactions', {
    user_id: owner.id,
    type: 'expense',
    direction: 'decrease',
    amount: 4242.42,
    currency_code: 'PHP',
    transaction_date: '2026-06-15',
    source_account_id: account,
    merchant_name: 'A merchant',
    status: 'confirmed',
  });
  const bill = await one('bills', {
    user_id: owner.id,
    provider_name: 'A power bill',
    amount: 1500,
    currency_code: 'PHP',
    due_date: '2026-11-01',
  });

  // A real stored file, so the document route can succeed for its owner.
  const path = `${owner.id}/cross-user-${crypto.randomUUID()}.png`;
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  const { error: uploadError } = await admin!.storage
    .from(BUCKET)
    .upload(path, png, { contentType: 'image/png' });
  if (uploadError) throw new Error(`seed upload: ${uploadError.message}`);
  const document = await one('documents', {
    user_id: owner.id,
    original_filename: 'a-receipt.png',
    original_mime_type: 'image/png',
    original_path: path,
    display_path: path,
  });

  return { account, transaction, bill, document, path };
}

/** Every row of A's, exactly as stored. */
async function snapshot(): Promise<Record<string, unknown>> {
  const read = async (table: string, id: string) =>
    (await admin!.from(table).select('*').eq('id', id).single()).data;
  return {
    account: await read('accounts', owned.account),
    transaction: await read('transactions', owned.transaction),
    bill: await read('bills', owned.bill),
    document: await read('documents', owned.document),
  };
}

async function api(user: User, method: string, path: string, body?: unknown) {
  return fetch(`${URL_}${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${user.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function app(user: User, path: string) {
  return fetch(`${APP}${path}`, { headers: { cookie: user.cookie }, redirect: 'manual' });
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

async function waitForApp() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(`${APP}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`The app is not reachable at ${APP}. Start it with npm run dev.`);
}

describe.skipIf(!enabled)('cross-user isolation: B attacks A’s records', () => {
  beforeAll(async () => {
    assertStagingIdentity(process.env);
    await waitForApp();
    A = await createUser('a');
    B = await createUser('b');
    owned = await seed(A);
    before = await snapshot();
  }, 180_000);

  afterAll(async () => {
    if (results.length) {
      const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
      const lines = results.map(
        (r) =>
          `${r.ok ? 'PASS' : 'FAIL'}  ${w(r.layer, 11)} ${w(r.attempt, 52)} ${w(r.expected, 22)} ${r.actual}`,
      );
      console.log(
        `\n${'RESULT'.padEnd(6)}${w('LAYER', 12)}${w('ATTEMPT (as B, on A’s record)', 53)}${w('EXPECTED', 23)}ACTUAL\n` +
          lines.join('\n'),
      );
    }
    if (owned) await admin!.storage.from(BUCKET).remove([owned.path]);
    for (const id of created) await admin!.auth.admin.deleteUser(id);
  }, 60_000);

  describe('1. Supabase data API with B’s token', () => {
    const tables = [
      ['accounts', 'account', { is_archived: true }],
      ['transactions', 'transaction', { notes: 'changed by B' }],
      ['bills', 'bill', { amount: 1 }],
      ['documents', 'document', { is_archived: true }],
    ] as const;

    it.each(tables)('read %s: no rows (200, empty)', async (table, key) => {
      const res = await api(B, 'GET', `/rest/v1/${table}?id=eq.${owned[key]}&select=*`);
      const rows = (await res.json()) as unknown[];
      const control = (await (
        await api(A, 'GET', `/rest/v1/${table}?id=eq.${owned[key]}&select=id`)
      ).json()) as unknown[];
      const row = record({
        layer: 'data API',
        attempt: `GET ${table} by id`,
        expected: '0 rows (A sees 1)',
        actual: `${res.status}, ${rows.length} rows (A: ${control.length})`,
        ok: rows.length === 0 && control.length === 1,
      });
      expect(row.ok, row.actual).toBe(true);
    });

    it.each(tables)('update %s: 403', async (table, key, patch) => {
      const res = await api(B, 'PATCH', `/rest/v1/${table}?id=eq.${owned[key]}`, patch);
      const row = record({
        layer: 'data API',
        attempt: `PATCH ${table}`,
        expected: '403',
        actual: String(res.status),
        ok: res.status === 403,
      });
      expect(row.ok, row.actual).toBe(true);
    });

    it.each(tables)('delete %s: 403', async (table, key) => {
      const res = await api(B, 'DELETE', `/rest/v1/${table}?id=eq.${owned[key]}`);
      const row = record({
        layer: 'data API',
        attempt: `DELETE ${table}`,
        expected: '403',
        actual: String(res.status),
        ok: res.status === 403,
      });
      expect(row.ok, row.actual).toBe(true);
    });

    it('create a bill in A’s name: 403', async () => {
      const res = await api(B, 'POST', '/rest/v1/bills', {
        user_id: A.id,
        provider_name: 'planted by B',
        amount: 1,
        due_date: '2026-12-01',
      });
      const row = record({
        layer: 'data API',
        attempt: 'POST bills with user_id = A',
        expected: '403',
        actual: String(res.status),
        ok: res.status === 403,
      });
      expect(row.ok, row.actual).toBe(true);
    });

    it('download A’s stored file through the storage API: refused', async () => {
      const res = await api(
        B,
        'GET',
        `/storage/v1/object/authenticated/${BUCKET}/${owned.path}`,
      );
      const body = await res.text();
      // The bucket has no client policies at all: nobody, the owner included,
      // reads files through this API — the app's route hands out short signed
      // URLs after its own ownership check (layer 2). So the control is that
      // the object really exists, read with the service role.
      const exists = !(await admin!.storage.from(BUCKET).download(owned.path)).error;
      // Supabase Storage answers a hidden object with HTTP 400 and a body of
      // statusCode "404" — its own convention, reported as-is.
      const row = record({
        layer: 'storage API',
        attempt: 'GET A’s file',
        expected: 'not found (file exists)',
        actual: `${res.status} ${body.includes('not_found') ? '"not_found"' : body.slice(0, 40)} (exists: ${exists})`,
        ok: res.status >= 400 && res.status < 500 && body.includes('not_found') && exists,
      });
      expect(row.ok, row.actual).toBe(true);
    });
  });

  describe('2. The app over HTTP with B’s session', () => {
    const routes = (o: Owned) =>
      [
        ['bill page', `/bills/${o.bill}`, 200],
        ['document review page', `/documents/${o.document}/review`, 200],
        ['document file (original)', `/api/documents/${o.document}/original`, 307],
        ['document file (display)', `/api/documents/${o.document}/display`, 307],
      ] as const;

    it(
      'every route answers 404 to B, and works for A',
      { timeout: 180_000 },
      async () => {
        for (const [label, path, ownerStatus] of routes(owned)) {
          const res = await app(B, path);
          const control = await app(A, path);
          const row = record({
            layer: 'app HTTP',
            attempt: `GET ${label}`,
            expected: `404 (A gets ${ownerStatus})`,
            actual: `${res.status} (A: ${control.status})`,
            ok: res.status === 404 && control.status === ownerStatus,
          });
          expect(row.ok, `${label}: ${row.actual}`).toBe(true);
        }
      },
    );
  });

  describe('3. Server actions run as B', () => {
    const attempts = (o: Owned) =>
      [
        [
          'updateAccountAction',
          async () =>
            (await import('@/app/actions/finance')).updateAccountAction(
              {},
              form({ id: o.account, name: 'renamed by B', institutionName: '' }),
            ),
        ],
        [
          'archiveAccountAction',
          async () =>
            (await import('@/app/actions/finance')).archiveAccountAction(
              form({ id: o.account, archived: 'true' }),
            ),
        ],
        [
          'deleteAccountAction (finance)',
          async () =>
            (await import('@/app/actions/finance')).deleteAccountAction(
              {},
              form({ id: o.account }),
            ),
        ],
        [
          'updateTransactionAction',
          async () =>
            (await import('@/app/actions/finance')).updateTransactionAction(
              {},
              form({ id: o.transaction, amount: '1.00', transactionDate: '2026-06-15' }),
            ),
        ],
        [
          'voidTransactionAction',
          async () =>
            (await import('@/app/actions/finance')).voidTransactionAction(
              {},
              form({ id: o.transaction, reason: 'voided by B' }),
            ),
        ],
        [
          'updateObligationAction (bill)',
          async () =>
            (await import('@/app/actions/obligations')).updateObligationAction(
              {},
              form({
                id: o.bill,
                kind: 'bill',
                name: 'renamed by B',
                amount: '1.00',
                date: '2026-11-01',
              }),
            ),
        ],
        [
          'cancelObligationAction (bill)',
          async () =>
            (await import('@/app/actions/obligations')).cancelObligationAction(
              form({ id: o.bill, kind: 'bill' }),
            ),
        ],
        [
          'archiveDocumentAction',
          async () =>
            (await import('@/app/actions/documents')).archiveDocumentAction(
              form({ id: o.document, archived: 'true' }),
            ),
        ],
        [
          'runExtractionAction (read A’s file)',
          async () =>
            (await import('@/app/actions/extraction')).runExtractionAction(
              {},
              form({ documentId: o.document }),
            ),
        ],
      ] as const;

    it('no action changes anything of A’s', { timeout: 120_000 }, async () => {
      ctx.jar = B.jar;
      for (const [name, run] of attempts(owned)) {
        let outcome: string;
        try {
          const result = (await run()) as {
            error?: string;
            fieldErrors?: unknown;
          } | void;
          outcome = result?.error
            ? `error: "${result.error}"`
            : result?.fieldErrors
              ? `fieldErrors: ${JSON.stringify(result.fieldErrors)}`
              : 'no error returned';
        } catch (error) {
          outcome = `threw: ${error instanceof Error ? error.message : String(error)}`;
        }
        const unchanged = JSON.stringify(await snapshot()) === JSON.stringify(before);
        const row = record({
          layer: 'action',
          attempt: name,
          expected: 'A’s rows unchanged',
          actual: `${unchanged ? 'unchanged' : 'CHANGED'}; ${outcome}`,
          ok: unchanged,
        });
        expect(row.ok, `${name}: ${row.actual}`).toBe(true);
      }
    });
  });

  it('afterwards, every one of A’s rows is exactly as created', async () => {
    const after = await snapshot();
    const row = record({
      layer: 'final',
      attempt: 'A’s account, transaction, bill, document',
      expected: 'byte-for-byte equal',
      actual: JSON.stringify(after) === JSON.stringify(before) ? 'equal' : 'DIFFERENT',
      ok: JSON.stringify(after) === JSON.stringify(before),
    });
    expect(row.ok).toBe(true);
  });
});
