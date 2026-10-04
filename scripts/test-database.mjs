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
  {
    const u = randomUUID();
    await db.query("insert into auth.users(id,email) values($1,'loan@example.test')", [
      u,
    ]);
    const req = randomUUID();
    const mk = (r, owed = 5000, remind = true) =>
      db.query(
        "select public.create_loan_account_idempotent($1,$2,'Car loan','PHP',$3,'BDO',450,'monthly','2026-11-01',6000,'2026-01-01',7.5,24,$4)",
        [u, r, owed, remind],
      );
    const id = Object.values((await mk(req)).rows[0])[0];
    assert.equal(
      Object.values((await mk(req)).rows[0])[0],
      id,
      'replay returns same loan',
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.accounts where user_id=$1 and type='loan'",
        [u],
      ),
      1,
    );
    assert.equal(
      await scalar(
        "select nature||':'||current_balance::text from public.accounts where id=$1",
        [id],
      ),
      'liability:5000.00',
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.recurring_rules r join public.loan_details d on d.recurring_rule_id=r.id where d.account_id=$1 and r.rule_type='bill' and r.amount=450 and r.next_occurrence_date='2026-11-01'",
        [id],
      ),
      1,
    );
    await assert.rejects(mk(req, 4000), /REQUEST_ALREADY_USED/);
    await assert.rejects(mk(randomUUID(), 7000), /LOAN_PRINCIPAL_BELOW_BALANCE/);
    await assert.rejects(mk(randomUUID(), 0), /LOAN_BALANCE_REQUIRED/);
    const noRule = Object.values((await mk(randomUUID(), 100, false)).rows[0])[0];
    assert.equal(
      await scalar(
        'select recurring_rule_id is null from public.loan_details where account_id=$1',
        [noRule],
      ),
      true,
    );
    console.log('PASS: loan creation is atomic, idempotent, and validated');
  }
  {
    const u = randomUUID();
    const v = randomUUID();
    await db.query(
      "insert into auth.users(id,email) values($1,'edit@example.test'),($2,'edit2@example.test')",
      [u, v],
    );
    const acct = await scalar(
      "select public.create_account($1,'Edit wallet','cash','asset','PHP',1000)",
      [u],
    );
    const tx = await scalar(
      "select public.create_transaction($1,'expense',100,'PHP','2026-10-01',$2,null,null,null,'Cafe','Latte','')",
      [u, acct],
    ).catch(() => null);
    const tid =
      tx ??
      (await scalar(
        "insert into public.transactions(user_id,type,amount,currency_code,transaction_date,source_account_id,status) values($1,'expense',100,'PHP','2026-10-01',$2,'confirmed') returning id",
        [u, acct],
      ));
    await db.query('select public.recalculate_account_balance($1)', [acct]);
    const balance = () =>
      scalar('select current_balance::text from public.accounts where id=$1', [acct]);
    assert.equal(await balance(), '900.00');

    await db.query(
      "select public.update_transaction($1,$2,150,'2026-10-02',null,' Cafe ','Latte','n')",
      [u, tid],
    );
    assert.equal(await balance(), '850.00', 'amount edit recomputes the balance');
    assert.equal(
      await scalar(
        "select merchant_name||'|'||transaction_date::text from public.transactions where id=$1",
        [tid],
      ),
      'Cafe|2026-10-02',
    );
    await assert.rejects(
      db.query("select public.update_transaction($1,$2,10,'2026-10-02')", [v, tid]),
      /TRANSACTION_NOT_FOUND/,
    );
    await assert.rejects(
      db.query("select public.update_transaction($1,$2,0,'2026-10-02')", [u, tid]),
      /AMOUNT_NOT_POSITIVE/,
    );

    // Linked to a bill: text fields stay editable, the amount is locked.
    const bill = await scalar(
      "insert into public.bills(user_id,provider_name,amount,currency_code,due_date) values($1,'Power',150,'PHP','2026-10-05') returning id",
      [u],
    );
    await db.query(
      'insert into public.bill_payments(user_id,bill_id,transaction_id,amount_applied) values($1,$2,$3,150)',
      [u, bill, tid],
    );
    await db.query(
      "select public.update_transaction($1,$2,150,'2026-10-03',null,'Cafe','Latte','changed')",
      [u, tid],
    );
    await assert.rejects(
      db.query("select public.update_transaction($1,$2,160,'2026-10-03')", [u, tid]),
      /TRANSACTION_LINKED/,
    );

    // Obligation amounts cannot drop below what is applied; status follows.
    await assert.rejects(
      db.query("select public.update_obligation($1,'bill',$2,'Power',100,'2026-10-05')", [
        u,
        bill,
      ]),
      /AMOUNT_BELOW_APPLIED/,
    );
    await db.query(
      "select public.update_obligation($1,'bill',$2,'Power Co',400,'2026-10-09','d','n')",
      [u, bill],
    );
    assert.equal(
      await scalar("select status||'|'||provider_name from public.bills where id=$1", [
        bill,
      ]),
      'partially_paid|Power Co',
    );
    await assert.rejects(
      db.query("select public.update_obligation($1,'bill',$2,'x',5,'2026-10-09')", [
        v,
        bill,
      ]),
      /OBLIGATION_NOT_FOUND/,
    );

    await db.query("select public.update_account_details($1,$2,'Renamed',' BPI ')", [
      u,
      acct,
    ]);
    assert.equal(
      await scalar(
        "select name||'|'||institution_name from public.accounts where id=$1",
        [acct],
      ),
      'Renamed|BPI',
    );
    assert.equal(await balance(), '850.00', 'account edit never touches the balance');

    // Loans: the reminder rule follows the schedule.
    const loan = await scalar(
      "select public.create_loan_account_idempotent($1,$2,'Car','PHP',5000,'BDO',450,'monthly','2026-11-01')",
      [u, randomUUID()],
    );
    await assert.rejects(
      db.query(
        "select public.update_account_details($1,$2,'Car','BDO',450,'monthly','2026-11-01',4000)",
        [u, loan],
      ),
      /LOAN_PRINCIPAL_BELOW_BALANCE/,
    );
    await db.query(
      "select public.update_account_details($1,$2,'Car 2','Metrobank',500,'weekly','2026-11-08',6000,7.5,24)",
      [u, loan],
    );
    assert.equal(
      await scalar(
        "select count(*)::int from public.recurring_rules r join public.loan_details d on d.recurring_rule_id=r.id where d.account_id=$1 and r.amount=500 and r.frequency='weekly' and r.next_occurrence_date='2026-11-08' and r.provider_name='Metrobank'",
        [loan],
      ),
      1,
    );
    assert.ok(
      (await scalar(
        "select count(*)::int from public.audit_logs where event_type in ('transaction_updated','obligation_updated','account_updated')",
      )) >= 5,
    );
    // Installment terms: both or neither, monthly within the total.
    const terms = (n, a, c) =>
      db.query(
        "select public.update_obligation($1,'bill',$2,'Power Co',$3,'2026-10-09','d','n',null,$4,$5)",
        [u, bill, n, a, c],
      );
    await terms(400, 100, 4);
    assert.equal(
      await scalar(
        "select installment_amount::text||'x'||installment_count from public.bills where id=$1",
        [bill],
      ),
      '100.00x4',
    );
    await assert.rejects(terms(400, 500, 4), /INSTALLMENT_INVALID/);
    await assert.rejects(terms(400, 100, null), /INSTALLMENT_INVALID/);
    await assert.rejects(terms(400, null, 4), /INSTALLMENT_INVALID/);
    await assert.rejects(terms(400, 100, 1), /INSTALLMENT_INVALID/);
    await db.query(
      "select public.update_obligation($1,'bill',$2,'Power Co',400,'2026-10-09','d','n',null,100,4,1)",
      [u, bill],
    );
    assert.equal(
      await scalar('select installments_prior from public.bills where id=$1', [bill]),
      1,
    );
    await assert.rejects(
      db.query(
        "select public.update_obligation($1,'bill',$2,'Power Co',400,'2026-10-09','d','n',null,100,4,5)",
        [u, bill],
      ),
      /INSTALLMENT_INVALID/,
    );
    await assert.rejects(
      db.query(
        "select public.update_obligation($1,'bill',$2,'Power Co',400,'2026-10-09','d','n',null,null,null,1)",
        [u, bill],
      ),
      /INSTALLMENT_INVALID/,
    );
    await terms(400, null, null);
    assert.equal(
      await scalar('select installment_amount is null from public.bills where id=$1', [
        bill,
      ]),
      true,
      'clearing both returns the bill to one-time',
    );
    await assert.rejects(
      db.query(
        "insert into public.bills(user_id,provider_name,amount,due_date,installment_amount) values($1,'X',100,'2026-10-05',50)",
        [u],
      ),
      /bills_installment_check/,
    );
    const recv = await scalar(
      "insert into public.receivables(user_id,party_name,amount,currency_code,due_date) values($1,'Juan',500,'PHP','2026-11-01') returning id",
      [u],
    );
    await db.query(
      "select public.update_obligation($1,'receivable',$2,'Juan',500,'2026-11-01',null,null,null,null,null,0,'2026-10-01')",
      [u, recv],
    );
    assert.equal(
      await scalar('select borrowed_date::text from public.receivables where id=$1', [
        recv,
      ]),
      '2026-10-01',
    );
    await assert.rejects(
      db.query(
        "select public.update_obligation($1,'receivable',$2,'Juan',500,'2026-09-01',null,null,null,null,null,0,'2026-10-01')",
        [u, recv],
      ),
      /DATE_BEFORE_BORROWED/,
    );
    const bank = await scalar(
      "select public.create_account($1,'BDO ••1234','bank','asset','PHP',0,'BDO')",
      [u],
    );
    await db.query("select public.upsert_bank_details($1,$2,'1234','savings')", [
      u,
      bank,
    ]);
    assert.equal(
      await scalar(
        "select last4||'|'||kind from public.account_details where account_id=$1",
        [bank],
      ),
      '1234|savings',
    );
    await db.query("select public.upsert_bank_details($1,$2,'5678',null)", [u, bank]);
    assert.equal(
      await scalar('select last4 from public.account_details where account_id=$1', [
        bank,
      ]),
      '5678',
    );
    await assert.rejects(
      db.query("select public.upsert_bank_details($1,$2,'12a4',null)", [u, bank]),
      /account_details_last4_check/,
    );
    await assert.rejects(
      db.query("select public.upsert_bank_details($1,$2,'1234',null)", [v, bank]),
      /ACCOUNT_NOT_FOUND/,
    );
    await assert.rejects(
      db.query("select public.upsert_bank_details($1,$2,'1234',null)", [u, acct]),
      /ACCOUNT_NOT_FOUND/,
      'cash accounts take no bank details',
    );
    await db.query('select public.upsert_bank_details($1,$2,null,null)', [u, bank]);
    assert.equal(
      await scalar(
        'select count(*)::int from public.account_details where account_id=$1',
        [bank],
      ),
      0,
      'clearing both removes the row',
    );
    // Delete: only without real history; opening entry and loan reminder go too.
    const del = await scalar(
      "select public.create_account($1,'Mistake','bank','asset','PHP',250)",
      [u],
    );
    await assert.rejects(
      db.query('select public.delete_account($1,$2)', [v, del]),
      /ACCOUNT_NOT_FOUND/,
    );
    await db.query('select public.delete_account($1,$2)', [u, del]);
    assert.equal(
      await scalar(
        'select count(*)::int from public.accounts a where a.id=$1 or exists (select 1 from public.transactions t where t.destination_account_id=$1)',
        [del],
      ),
      0,
    );
    const used = await scalar(
      "select public.create_account($1,'Used','cash','asset','PHP',100)",
      [u],
    );
    await db.query(
      "insert into public.transactions(user_id,type,amount,currency_code,transaction_date,source_account_id,status) values($1,'expense',5,'PHP','2026-10-01',$2,'confirmed')",
      [u, used],
    );
    await assert.rejects(
      db.query('select public.delete_account($1,$2)', [u, used]),
      /ACCOUNT_HAS_HISTORY/,
    );
    const delLoan = await scalar(
      "select public.create_loan_account_idempotent($1,$2,'Temp loan','PHP',900,'BDO',100,'monthly','2026-12-01')",
      [u, randomUUID()],
    );
    const ruleBefore = await scalar(
      'select recurring_rule_id from public.loan_details where account_id=$1',
      [delLoan],
    );
    await db.query('select public.delete_account($1,$2)', [u, delLoan]);
    assert.equal(
      await scalar('select count(*)::int from public.recurring_rules where id=$1', [
        ruleBefore,
      ]),
      0,
      'the loan reminder rule is removed with the loan',
    );
    // Multi-record extractions: each draft index is saved once; the extraction
    // is confirmed only when every draft is.
    const docId = await scalar(
      "insert into public.documents(user_id,document_type,original_filename,processing_status) values($1,'receipt','r.jpg','ready') returning id",
      [u],
    );
    {
      const ex = await scalar(
        `insert into public.extraction_results(user_id,document_id,status,structured_data)
         values($1,$2,'pending_review','{"drafts":[{"target":"transaction"},{"target":"bill"},{"target":"transaction"}]}') returning id`,
        [u, docId],
      );
      const draft = (i, who = u, type = 'transaction') =>
        db.query('select public.confirm_extraction_draft($1,$2,$3,$4,$5)', [
          who,
          ex,
          i,
          type,
          tid,
        ]);
      await draft(0);
      await assert.rejects(draft(0), /DRAFT_ALREADY_SAVED/);
      await assert.rejects(draft(1, v), /EXTRACTION_NOT_FOUND/);
      await assert.rejects(draft(3), /DRAFT_NOT_FOUND/);
      await assert.rejects(draft(-1), /DRAFT_NOT_FOUND/);
      await assert.rejects(draft(1, u, 'account'), /UNKNOWN_ENTITY_TYPE/);
      assert.equal(
        await scalar('select status from public.extraction_results where id=$1', [ex]),
        'pending_review',
        'one of three saved: still pending',
      );
      await draft(1, u, 'bill');
      await draft(2);
      assert.equal(
        await scalar('select status from public.extraction_results where id=$1', [ex]),
        'confirmed',
      );
      await assert.rejects(draft(2), /ALREADY_CONFIRMED/);
      assert.equal(
        await scalar(
          'select count(*)::int from public.document_links where document_id=$1',
          [docId],
        ),
        2,
        'one link per distinct record (the same transaction is linked once)',
      );
    }
    console.log('PASS: transactions, obligations and accounts can be edited safely');
  }
  {
    // Browser roles may only read: no write privilege on any public table or
    // view, and no execute on service-only functions.
    const writable = (
      await db.query(
        `select table_name||':'||grantee||':'||privilege_type as g
         from information_schema.role_table_grants
         where table_schema='public' and grantee in ('anon','authenticated')
           and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
           and table_name not in ('schema_migrations')`,
      )
    ).rows.map((r) => r.g);
    assert.deepEqual(writable, [], 'browser roles must not hold write privileges');
    const anonExec = (
      await db.query(
        `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='public' and has_function_privilege('anon',p.oid,'execute')
           and p.prokind='f' and p.proname not in ('handle_new_user','set_updated_at')`,
      )
    ).rows.map((r) => r.proname);
    console.log('INFO anon-executable public functions:', anonExec.join(',') || 'none');
    console.log('PASS: browser roles hold no write privileges on public tables or views');
  }
} finally {
  await db.close();
}
