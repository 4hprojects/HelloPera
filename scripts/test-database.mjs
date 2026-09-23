import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

const db = new PGlite();
try {
  await db.exec(await readFile('tests/database/bootstrap.sql', 'utf8'));
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    try {
      await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
    } catch (error) {
      throw new Error(`${file}: ${error.message}`);
    }
  }
  for (const file of (await readdir('supabase/migrations'))
    .filter((f) => f.startsWith('20260923'))
    .sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8'));
  }
  console.log('PASS: all migrations execute on isolated PostgreSQL');
  const scalar = async (sql, params = []) =>
    Object.values((await db.query(sql, params)).rows[0])[0];
  const a = randomUUID(),
    b = randomUUID();
  await db.query(
    "insert into auth.users(id,email) values($1,'a@example.test'),($2,'b@example.test')",
    [a, b],
  );
  const account = await scalar(
    "select public.create_account($1,'Wallet','cash','asset','PHP',1000)",
    [a],
  );
  const other = await scalar(
    "select public.create_account($1,'Other','cash','asset','PHP',1000)",
    [b],
  );
  for (const [kind,table,nameColumn,dateColumn] of [
    ['receivable','receivables','party_name','due_date'],
    ['expected_income','expected_income','source_name','expected_date'],
  ]) {
    const id = await scalar(`insert into public.${table}(user_id,${nameColumn},amount,currency_code,${dateColumn}) values($1,'Incoming fixture',10,'PHP','2026-09-23') returning id`,[b]);
    await scalar("select public.record_obligation_payment($1,$2,$3,$4,10,$5,'2026-09-23')",[b,randomUUID(),kind,id,other]);
    assert.equal(await scalar(`select status from public.${table} where id=$1`,[id]),'paid');
  }
  console.log('PASS: receivable and expected-income settlement');
  const bill = await scalar(
    "insert into public.bills(user_id,provider_name,amount,currency_code,due_date) values($1,'Power',100,'PHP','2026-09-23') returning id",
    [a],
  );
  const pay = (key, amount, tx = null, owner = a) =>
    scalar(
      "select public.record_obligation_payment($1,$2,'bill',$3,$4,$5,'2026-09-23',$6)",
      [owner, key, bill, amount, tx ? null : account, tx],
    );
  const key = randomUUID();
  const first = await pay(key, 40);
  assert.deepEqual(await pay(key, 40), first);
  assert.equal(
    await scalar('select current_balance::text from public.accounts where id=$1', [
      account,
    ]),
    '960.00',
  );
  await assert.rejects(pay(key, 41), /REQUEST_ALREADY_USED/);
  const before = await scalar('select count(*)::int from public.transactions');
  await assert.rejects(pay(randomUUID(), 100), /EXCEEDS_OBLIGATION_REMAINING/);
  assert.equal(await scalar('select count(*)::int from public.transactions'), before);
  await assert.rejects(pay(randomUUID(), 1, null, b), /OBLIGATION_NOT_FOUND/);
  console.log(
    'PASS: payment retries, payload mismatch, rollback, and cross-user rejection',
  );
  const income = await scalar(
    "select public.create_transaction($1,'income',20,'PHP','2026-09-23',null,$2)",
    [a, account],
  );
  await assert.rejects(pay(randomUUID(), 20, income), /TRANSACTION_DIRECTION_MISMATCH/);
  const expense = await scalar(
    "select public.create_transaction($1,'expense',60,'PHP','2026-09-23',$2)",
    [a, account],
  );
  await pay(randomUUID(), 60, expense);
  assert.equal(
    await scalar('select status from public.bills where id=$1', [bill]),
    'paid',
  );
  const event = await scalar(
    "insert into public.expected_events(user_id,event_type,name,amount,currency_code,scheduled_date) values($1,'expense','Power',60,'PHP','2026-09-23') returning id",
    [a],
  );
  await assert.rejects(
    db.query('select public.fulfill_expected_event($1,$2,$3)', [a, event, income]),
    /DIRECTION_MISMATCH/,
  );
  await db.query('select public.fulfill_expected_event($1,$2,$3)', [a, event, expense]);
  await db.query('select public.fulfill_expected_event($1,$2,$3)', [a, event, expense]);
  await assert.rejects(
    db.query('select public.fulfill_expected_event($1,$2,$3)', [b, event, expense]),
    /RECORD_NOT_FOUND/,
  );
  await db.query("select public.void_transaction($1,$2,'Correction')", [a, expense]);
  assert.equal(
    await scalar('select status from public.expected_events where id=$1', [event]),
    'scheduled',
  );
  assert.equal(
    await scalar('select status from public.bills where id=$1', [bill]),
    'partially_paid',
  );
  assert.equal(
    await scalar('select current_balance::text from public.accounts where id=$1', [
      account,
    ]),
    '980.00',
  );
  await assert.rejects(
    db.query('select public.fulfill_expected_event($1,$2,$3)', [a, event, expense]),
    /TRANSACTION_NOT_CONFIRMED/,
  );
  const usd = await scalar(
    "select public.create_account($1,'USD','cash','asset','USD',100)",
    [a],
  );
  const usdExpense = await scalar(
    "select public.create_transaction($1,'expense',1,'USD','2026-09-23',$2)",
    [a, usd],
  );
  await assert.rejects(
    db.query('select public.fulfill_expected_event($1,$2,$3)', [a, event, usdExpense]),
    /CURRENCY_MISMATCH/,
  );
  console.log('PASS: settlement, recurring validation, void/reopen, and balances');
  await db.query(
    "insert into public.bills(user_id,provider_name,amount,currency_code,due_date) select $1,'Fixture '||i,1,'PHP','2026-09-23' from generate_series(1,1001) i",
    [a],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  await db.exec('set role authenticated');
  const obligations = await scalar("select public.read_obligations('bill')");
  assert.equal(obligations.length, 1002);
  const details = await scalar(
    "select public.read_obligations('bill',true,false,null,null,$1)",
    [bill],
  );
  assert.equal(details.length, 1);
  assert.equal(details[0].bill_payments[0].amount_applied, '40.00');
  const bundle = await scalar('select public.export_financial_snapshot()');
  assert.equal(bundle.bills.length, 1002);
  assert.equal(bundle.bill_payments.length, 1);
  assert.equal(bundle.expected_events.length, 1);
  assert.equal(
    bundle.accounts.some((x) => x.id === other),
    false,
  );
  assert.equal(
    bundle.transactions.every((x) => typeof x.amount === 'string'),
    true,
  );
  for (const fn of [
    'record_obligation_payment',
    'fulfill_expected_event',
    'begin_account_deletion',
  ]) {
    assert.equal(
      await scalar(
        "select bool_and(not has_function_privilege('authenticated',oid,'execute')) from pg_proc where proname=$1",
        [fn],
      ),
      true,
    );
    assert.equal(
      await scalar(
        "select bool_and(not has_function_privilege('anon',oid,'execute')) from pg_proc where proname=$1",
        [fn],
      ),
      true,
    );
  }
  await db.exec('reset role');
  console.log(
    'PASS: complete snapshot export, RLS isolation, exact strings, and RPC grants',
  );
  await db.query(
    "insert into public.deletion_challenges(token_hash,user_id,expires_at,approved_at) values('expired',$1,now()-interval '1 minute',now()),('fresh',$1,now()+interval '5 minutes',now())",
    [a],
  );
  await assert.rejects(
    db.query("select public.begin_account_deletion($1,'expired')", [a]),
    /REAUTHENTICATION_REQUIRED/,
  );
  await db.query("select public.begin_account_deletion($1,'fresh')", [a]);
  await assert.rejects(
    db.query("select public.begin_account_deletion($1,'fresh')", [a]),
    /REAUTHENTICATION_REQUIRED/,
  );
  await assert.rejects(
    db.query(
      "select public.create_transaction($1,'income',1,'PHP','2026-09-23',null,$2)",
      [a, account],
    ),
    /ACCOUNT_DELETION_IN_PROGRESS/,
  );
  await assert.rejects(
    db.query(
      "insert into storage.objects(bucket_id,name) values('hello-pera-documents',$1)",
      [`${a}/2026/09/file`],
    ),
    /ACCOUNT_DELETION_IN_PROGRESS/,
  );
  await db.query(
    'insert into public.audit_logs(actor_user_id,target_user_id,event_type,metadata) values($1,$1,\'account_deletion_requested\',\'{"email":"a@example.test"}\')',
    [a],
  );
  await db.query('delete from auth.users where id=$1', [a]);
  assert.equal(
    await scalar('select count(*)::int from public.transactions where user_id=$1', [a]),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.audit_logs where metadata::text like '%a@example.test%'",
    ),
    0,
  );
  assert.equal(
    await scalar(
      "select count(*)::int from public.audit_logs where event_type='account_deleted' and actor_user_id is null and metadata='{}'::jsonb",
    ),
    1,
  );
  console.log(
    'PASS: challenge expiry/replay, deletion freeze, cascade, and audit erasure',
  );
} finally {
  await db.close();
}
