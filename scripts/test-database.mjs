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
  for (const [kind, table, nameColumn, dateColumn] of [
    ['receivable', 'receivables', 'party_name', 'due_date'],
    ['expected_income', 'expected_income', 'source_name', 'expected_date'],
  ]) {
    const id = await scalar(
      `insert into public.${table}(user_id,${nameColumn},amount,currency_code,${dateColumn}) values($1,'Incoming fixture',10,'PHP','2026-09-23') returning id`,
      [b],
    );
    await scalar(
      "select public.record_obligation_payment($1,$2,$3,$4,10,$5,'2026-09-23')",
      [b, randomUUID(), kind, id, other],
    );
    assert.equal(
      await scalar(`select status from public.${table} where id=$1`, [id]),
      'paid',
    );
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
  {
    const c = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'c@example.test')", [c]);
    const req = randomUUID();
    const mk = (r, amt = 10) =>
      db.query(
        "select public.create_account_idempotent($1,$2,'Idem','cash','asset','PHP',$3)",
        [c, r, amt],
      );
    const first = Object.values((await mk(req)).rows[0])[0];
    const replay = Object.values((await mk(req)).rows[0])[0];
    assert.equal(replay, first);
    assert.equal(
      await scalar(
        "select count(*)::int from public.accounts where user_id=$1 and name='Idem'",
        [c],
      ),
      1,
    );
    await assert.rejects(mk(req, 11), /REQUEST_ALREADY_USED/);
    await assert.rejects(
      db.query(
        "select public.create_account_idempotent($1,null,'X','cash','asset','PHP',0)",
        [c],
      ),
      /REQUEST_ID_REQUIRED/,
    );
    const acct = first;
    const tx = (r) =>
      db.query(
        "select public.create_transaction_idempotent($1,$2,'income',5,'PHP','2026-09-23',null,$3)",
        [c, r, acct],
      );
    const treq = randomUUID();
    const before = await scalar(
      'select count(*)::int from public.transactions where user_id=$1',
      [c],
    );
    const t1 = Object.values((await tx(treq)).rows[0])[0];
    assert.equal(Object.values((await tx(treq)).rows[0])[0], t1);
    assert.equal(
      await scalar('select count(*)::int from public.transactions where user_id=$1', [c]),
      before + 1,
    );
    console.log(
      'PASS: idempotent account/transaction creation replays once and rejects mismatches',
    );

    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [c]);
    assert.equal(
      await scalar(
        "select jsonb_array_length(public.read_analytics_snapshot('2026-09-01','2026-09-30'))",
      ),
      1,
    );
    assert.ok(
      await scalar(
        "select bool_or(e->>'amount'='5.00') from jsonb_array_elements(public.read_analytics_snapshot('2026-09-01','2026-09-30')) e",
      ),
    );
    await assert.rejects(
      db.query("select public.read_analytics_snapshot('2026-09-01','2026-09-30',0)"),
      /INVALID_ANALYTICS_LIMIT/,
    );
    await db.exec('reset role');
    console.log('PASS: analytics snapshot is RLS-scoped, exact, and bounded');

    await db.query(
      "update public.feature_flags set enabled=false where key='financial_writes_enabled'",
    );
    assert.equal(
      await scalar("select public.run_recurring_generation(90,null)->>'reason'"),
      'financial_writes_disabled',
    );
    await db.query(
      "delete from public.feature_flags where key='financial_writes_enabled'",
    );
    await assert.rejects(
      db.query('select public.assert_financial_writes_enabled()'),
      /FINANCIAL_WRITES_DISABLED/,
    );
    console.log(
      'PASS: scheduled generation fails closed when financial writes are off or unreadable',
    );
  }
  {
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const admin = randomUUID();
    const victim = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'adm@example.test'),($2,'vic@example.test')",
      [admin, victim],
    );
    await db.query(
      "update public.profiles set role='admin', status='active' where id=$1",
      [admin],
    );
    const apply = (
      event,
      op,
      target,
      args = {},
      reason = 'testing',
      actor = admin,
      entity = null,
    ) =>
      db.query(
        'select public.admin_apply_change($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
        [actor, event, op, target, entity, reason, JSON.stringify(args), '{}'],
      );
    const auditCount = (event) =>
      scalar('select count(*)::int from public.audit_logs where event_type=$1', [event]);

    await apply('user_suspended', 'set_status', victim, { status: 'suspended' });
    assert.equal(
      await scalar('select status from public.profiles where id=$1', [victim]),
      'suspended',
    );
    assert.equal(await auditCount('user_suspended'), 1);
    assert.equal(
      await scalar(
        "select metadata->>'reason' from public.audit_logs where event_type='user_suspended'",
      ),
      'testing',
    );

    // Injected audit failure rolls the privileged change back.
    await db.query(
      "alter table public.audit_logs add constraint inject_fail check (event_type <> 'user_reactivated')",
    );
    await assert.rejects(
      apply('user_reactivated', 'set_status', victim, { status: 'active' }),
      /inject_fail/,
    );
    assert.equal(
      await scalar('select status from public.profiles where id=$1', [victim]),
      'suspended',
    );
    await db.query('alter table public.audit_logs drop constraint inject_fail');

    // Refusals: self-target, non-admin actor, suspended admin, short reason, unknown op.
    await assert.rejects(
      apply('role_changed', 'set_role', admin, { role: 'user' }),
      /SELF_TARGET/,
    );
    await assert.rejects(
      apply('role_changed', 'set_role', admin, { role: 'admin' }, 'testing', victim),
      /ADMIN_REQUIRED/,
    );
    await assert.rejects(
      apply('role_changed', 'set_role', victim, { role: 'admin' }, 'x'),
      /REASON_REQUIRED/,
    );
    await assert.rejects(
      apply('role_changed', 'bogus', victim),
      /UNKNOWN_ADMIN_OPERATION/,
    );
    assert.equal(
      await scalar('select role from public.profiles where id=$1', [victim]),
      'user',
    );
    await db.query("update public.profiles set status='suspended' where id=$1", [admin]);
    await assert.rejects(
      apply('role_changed', 'set_role', victim, { role: 'admin' }),
      /ADMIN_REQUIRED/,
    );
    await db.query("update public.profiles set status='active' where id=$1", [admin]);

    // Direct client access is refused.
    await db.exec('set role authenticated');
    await assert.rejects(
      db.query(
        'select public.admin_apply_change($1,$2,$3,$4,null,$5,$6::jsonb,$7::jsonb)',
        [admin, 'role_changed', 'set_role', victim, 'testing', '{"role":"admin"}', '{}'],
      ),
      /permission denied/,
    );
    await db.exec('reset role');
    console.log(
      'PASS: admin change + audit are atomic; self-target, non-admin and direct access refused',
    );
  }
  {
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const u = randomUUID();
    const v = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'pc@example.test'),($2,'pd@example.test')",
      [u, v],
    );
    const acct = await scalar(
      "select public.create_account($1,'Cand','cash','asset','PHP',100000)",
      [u],
    );
    const vAcct = await scalar(
      "select public.create_account($1,'Other','cash','asset','PHP',100000)",
      [v],
    );
    await db.query(
      "select public.create_transaction($1,'expense',10,'PHP',('2026-01-01'::date + i)::date,$2,null,null,null,null,'Row '||i) from generate_series(1,120) i",
      [u, acct],
    );
    await db.query(
      "select public.create_transaction($1,'expense',10,'PHP','2026-06-01',$2,null,null,null,null,'Foreign')",
      [v, vAcct],
    );
    const bill = await scalar(
      "insert into public.bills(user_id,provider_name,amount,currency_code,due_date) values($1,'Cand bill',500,'PHP','2026-09-23') returning id",
      [u],
    );
    const oldest = await scalar(
      "select id from public.transactions where user_id=$1 and description='Row 1'",
      [u],
    );
    const newest = await scalar(
      "select id from public.transactions where user_id=$1 and description='Row 120'",
      [u],
    );
    // Partly allocate the oldest, fully allocate the newest.
    await db.query(
      "select public.record_obligation_payment($1,$2,'bill',$3,4,null,'2026-09-23',$4)",
      [u, randomUUID(), bill, oldest],
    );
    await db.query(
      "select public.record_obligation_payment($1,$2,'bill',$3,10,null,'2026-09-23',$4)",
      [u, randomUUID(), bill, newest],
    );

    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [u]);
    const page = async (args) =>
      (
        await db.query(
          'select * from public.list_payment_candidates($1,$2,$3,$4,$5,$6)',
          args,
        )
      ).rows;
    let seen = [];
    let cursor = [null, null];
    for (;;) {
      const rows = await page(['expense', 'PHP', null, cursor[0], cursor[1], 50]);
      seen.push(...rows);
      if (rows.length < 50) break;
      const last = rows[rows.length - 1];
      cursor = [last.transaction_date, last.id];
    }
    assert.equal(seen.length, 119, 'all but the fully allocated transaction, past 100');
    assert.ok(!seen.some((r) => r.id === newest), 'fully allocated hidden');
    assert.ok(
      seen.some((r) => r.id === oldest && r.remaining === '6.00'),
      'older than 100 selectable with remaining',
    );
    assert.ok(!seen.some((r) => r.description === 'Foreign'), 'other users never leak');
    assert.equal(
      (await page(['expense', 'PHP', 'row 7%', null, null, 50])).length,
      0,
      'wildcards are literal',
    );
    assert.equal((await page(['expense', 'PHP', 'Row 11', null, null, 50])).length, 11);
    assert.equal((await page(['income', 'PHP', null, null, null, 50])).length, 0);
    await db.exec('reset role');
    console.log(
      'PASS: payment candidates paginate past 100, hide allocated, show remaining, stay private',
    );
  }
  {
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    const w = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'agg@example.test')", [w]);
    // Beyond the 1,000-row REST cap.
    await db.query(
      "insert into public.ai_usage_logs(user_id,provider,model,call_type,status,duration_ms) select $1,'p','m','intent',case when i%4=0 then 'failed' else 'succeeded' end,i from generate_series(1,1200) i",
      [w],
    );
    await db.query(
      "insert into public.notifications(user_id,type,channel,delivery_status,dedupe_key,title,message) select $1,'bill_overdue','in_app',case when i%3=0 then 'failed' else 'pending' end,'k'||i,'t','m' from generate_series(1,1500) i",
      [w],
    );
    await db.query(
      "insert into public.job_runs(job_type,status,started_at) values('x','failed',now()),('x','failed',now()-interval '3 days'),('x','succeeded',now())",
    );
    const counts = (
      await db.query(
        "select public.admin_overview_counts(now()-interval '1 day', now()-interval '1 day') r",
      )
    ).rows[0].r;
    assert.equal(counts.ai_today, 1200);
    assert.equal(counts.ai_failed, 300);
    assert.equal(counts.notifications_pending, 1000);
    assert.equal(counts.notifications_failed, 500);
    assert.equal(counts.jobs_failed, 1, 'only failures inside the stated window');
    const ai = (
      await db.query("select public.admin_ai_aggregates(now()-interval '7 days') r")
    ).rows[0].r;
    assert.equal(ai.total, 1200);
    assert.equal(ai.by_call_type[0].count, 1200);
    const n = (await db.query('select public.admin_notification_aggregates() r')).rows[0]
      .r;
    assert.equal(
      n.by_delivery_status.reduce((t, x) => t + x.count, 0),
      1500,
    );
    await db.exec('set role authenticated');
    await assert.rejects(
      db.query('select public.admin_overview_counts(now(),now())'),
      /permission denied/,
    );
    await db.exec('reset role');
    console.log(
      'PASS: admin aggregates are exact beyond 1,000 rows, windowed, and service-only',
    );
  }
} finally {
  await db.close();
}
