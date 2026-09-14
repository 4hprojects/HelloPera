-- =============================================================================
-- Phase 14 — Financial integrity: detect without repairing
--
-- §65: "It should report mismatches. **Do not silently modify data without
-- controlled repair.**"
--
-- `check_balance_integrity()` as Phase 02 shipped it cannot satisfy that,
-- because it calls `recalculate_account_balance()` — whose last statement is
-- `update public.accounts set current_balance = ...`. Its own comment said so
-- plainly: "Recalculating repairs as it reads, so run it to both detect and fix
-- drift."
--
-- That was a reasonable thing to ship in Phase 02, when nothing was watching.
-- It is the wrong thing now, and the reason is worth stating: a checker that
-- repairs destroys the evidence of the drift it found. Nobody can then answer
-- how often it happens, to which accounts, or after which operation — so a real
-- bug in the balance engine looks exactly like a system that is working. A
-- finance application that silently self-corrects is one where the most
-- important class of defect is invisible by construction.
--
-- So the arithmetic is split from the write:
--
--   derive_account_balance()      the §34 matrix. Returns a number. Writes
--                                 nothing.
--   recalculate_account_balance() calls derive, then writes. Every existing
--                                 write path is unchanged.
--   check_balance_integrity()     calls derive. Reports. Never writes.
--
-- One copy of the matrix instead of two, which also means
-- `lib/finance/sql-parity.test.ts` guards one thing rather than needing to
-- guard both.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- derive_account_balance (§64)
--
-- The PHASE-02 §34 balance-effect matrix, moved here verbatim from
-- `recalculate_account_balance`. `accounts.opening_balance` is deliberately
-- excluded: an opening balance enters the ledger as an `opening_balance`
-- transaction, and counting the column as well would double it.
-- -----------------------------------------------------------------------------

create or replace function public.derive_account_balance(p_account_id uuid)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_nature  text;
  v_balance numeric(18, 2);
begin
  select nature into v_nature from public.accounts where id = p_account_id;
  if v_nature is null then
    raise exception 'No account %', p_account_id;
  end if;

  select coalesce(sum(
    case
      -- as SOURCE
      when t.source_account_id = p_account_id then
        case t.type
          when 'expense'    then case when v_nature = 'asset' then -t.amount else  t.amount end
          when 'transfer'   then case when v_nature = 'asset' then -t.amount else  t.amount end
          when 'adjustment' then case when t.direction = 'decrease' then -t.amount else t.amount end
          else 0
        end
      -- as DESTINATION
      when t.destination_account_id = p_account_id then
        case t.type
          when 'income'          then case when v_nature = 'asset' then t.amount else 0 end
          when 'refund'          then case when v_nature = 'asset' then t.amount else -t.amount end
          when 'transfer'        then case when v_nature = 'asset' then t.amount else -t.amount end
          when 'opening_balance' then case when t.direction = 'decrease' then -t.amount else t.amount end
          else 0
        end
      else 0
    end
  ), 0)
  into v_balance
  from public.transactions t
  where t.status = 'confirmed'
    and (t.source_account_id = p_account_id or t.destination_account_id = p_account_id);

  return v_balance;
end;
$$;

comment on function public.derive_account_balance(uuid) is
  'The PHASE-02 section 34 matrix. Returns the balance implied by confirmed transactions. Writes nothing.';

-- -----------------------------------------------------------------------------
-- recalculate_account_balance — now a thin write over derive
--
-- Behaviour is identical for every caller: the transaction RPCs still call this
-- after a write to refresh the cache. What changed is that the arithmetic lives
-- in one place.
-- -----------------------------------------------------------------------------

create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(18, 2);
begin
  v_balance := public.derive_account_balance(p_account_id);
  update public.accounts set current_balance = v_balance where id = p_account_id;
  return v_balance;
end;
$$;

comment on function public.recalculate_account_balance(uuid) is
  'Derives via derive_account_balance and writes the cache. Called after every balance-affecting write.';

-- -----------------------------------------------------------------------------
-- check_balance_integrity — now genuinely a check (§64, §65)
-- -----------------------------------------------------------------------------

create or replace function public.check_balance_integrity(p_user_id uuid)
returns table (account_id uuid, account_name text, cached numeric, derived numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select a.id, a.name, a.current_balance, public.derive_account_balance(a.id)
  from public.accounts a
  where a.user_id = p_user_id;
end;
$$;

comment on function public.check_balance_integrity(uuid) is
  'Reports cached vs derived balance per account. Read-only: repair is a separate audited admin action (PHASE-14 section 66).';

-- -----------------------------------------------------------------------------
-- check_financial_integrity (§64)
--
-- Every §64 check in one call, returning a uniform row shape so a caller can
-- render them without knowing what each one means.
--
-- `p_user_id` null means every user — the scheduled job's case. Scoped for an
-- admin looking at one account.
-- -----------------------------------------------------------------------------

create or replace function public.check_financial_integrity(p_user_id uuid default null)
returns table (
  check_name  text,
  user_id     uuid,
  entity_type text,
  entity_id   uuid,
  detail      text,
  expected    numeric,
  actual      numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- 1. Cached balance vs the transactions that imply it.
  return query
  select 'account_balance'::text, a.user_id, 'account'::text, a.id,
         a.name, public.derive_account_balance(a.id), a.current_balance
  from public.accounts a
  where (p_user_id is null or a.user_id = p_user_id)
    and a.current_balance is distinct from public.derive_account_balance(a.id);

  -- 2. A bill cannot have more applied to it than it is for. Over-allocation
  --    means a payment was linked twice, or a bill's amount was reduced after
  --    payments were recorded against it.
  return query
  select 'bill_over_allocated'::text, b.user_id, 'bill'::text, b.id,
         b.provider_name, b.amount, sum(p.amount_applied)
  from public.bills b
  join public.bill_payments p on p.bill_id = b.id
  where (p_user_id is null or b.user_id = p_user_id)
  group by b.id, b.user_id, b.provider_name, b.amount
  having sum(p.amount_applied) > b.amount;

  -- 3. Same for money owed to the user.
  return query
  select 'receivable_over_allocated'::text, r.user_id, 'receivable'::text, r.id,
         r.party_name, r.amount, sum(p.amount_applied)
  from public.receivables r
  join public.receivable_payments p on p.receivable_id = r.id
  where (p_user_id is null or r.user_id = p_user_id)
  group by r.id, r.user_id, r.party_name, r.amount
  having sum(p.amount_applied) > r.amount;

  -- 4. And for expected income.
  return query
  select 'expected_income_over_allocated'::text, e.user_id, 'expected_income'::text, e.id,
         e.source_name, e.amount, sum(p.amount_applied)
  from public.expected_income e
  join public.expected_income_receipts p on p.expected_income_id = e.id
  where (p_user_id is null or e.user_id = p_user_id)
  group by e.id, e.user_id, e.source_name, e.amount
  having sum(p.amount_applied) > e.amount;

  -- 5. A payment link whose obligation says it is fully paid but whose applied
  --    total says otherwise. The status is a cache of the sum, and a status
  --    that disagrees with its own evidence is how a paid bill reappears.
  return query
  select 'bill_status_mismatch'::text, b.user_id, 'bill'::text, b.id,
         b.provider_name || ' is marked ' || b.status, b.amount,
         coalesce((select sum(p.amount_applied) from public.bill_payments p where p.bill_id = b.id), 0)
  from public.bills b
  where (p_user_id is null or b.user_id = p_user_id)
    and b.status = 'paid'
    and coalesce((select sum(p.amount_applied) from public.bill_payments p where p.bill_id = b.id), 0) < b.amount;

  -- 6. Document links point at a uuid in another table with no foreign key to
  --    enforce it (`document_links.entity_id` is deliberately polymorphic), so
  --    nothing but this notices when the target is gone.
  return query
  select 'orphaned_document_link'::text, l.user_id, 'document_link'::text, l.id,
         'points at a missing ' || l.entity_type, null::numeric, null::numeric
  from public.document_links l
  where (p_user_id is null or l.user_id = p_user_id)
    and not exists (
      select 1 from public.transactions t
      where l.entity_type = 'transaction' and t.id = l.entity_id
      union all
      select 1 from public.bills b
      where l.entity_type = 'bill' and b.id = l.entity_id
      union all
      select 1 from public.receivables r
      where l.entity_type = 'receivable' and r.id = l.entity_id
      union all
      select 1 from public.expected_income e
      where l.entity_type = 'expected_income' and e.id = l.entity_id
    );

  -- 7. A subscription whose stored status contradicts its own dates. PHASE-11
  --    §29 makes the read path correct without this ever running, so a hit here
  --    means the reconciliation job is not running rather than that anyone lost
  --    access.
  return query
  select 'subscription_stale'::text, s.user_id, 'subscription'::text, s.id,
         'status ' || s.status || ' but the period ended', null::numeric, null::numeric
  from public.subscriptions s
  where (p_user_id is null or s.user_id = p_user_id)
    and (
      (s.status = 'grace'     and s.grace_period_end   is not null and s.grace_period_end   <= now())
      or
      (s.status = 'cancelled' and s.current_period_end is not null and s.current_period_end <= now())
    );
end;
$$;

comment on function public.check_financial_integrity(uuid) is
  'PHASE-14 section 64. Reports every integrity mismatch. Writes nothing, ever.';

-- -----------------------------------------------------------------------------
-- repair_account_balance (§66)
--
-- The controlled repair §65 requires. Narrow: one account. Deterministic: the
-- same derivation the check uses. It is called only from the admin action,
-- which supplies a reason and writes the audit row — this function deliberately
-- does neither, because a repair that audits itself would let a future caller
-- skip the reason and still look accounted for.
-- -----------------------------------------------------------------------------

create or replace function public.repair_account_balance(p_account_id uuid)
returns table (previous numeric, corrected numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous numeric(18, 2);
  v_corrected numeric(18, 2);
begin
  select current_balance into v_previous from public.accounts where id = p_account_id;
  if v_previous is null then
    raise exception 'No account %', p_account_id;
  end if;

  v_corrected := public.recalculate_account_balance(p_account_id);
  return query select v_previous, v_corrected;
end;
$$;

comment on function public.repair_account_balance(uuid) is
  'PHASE-14 section 66. Narrow, deterministic repair of one account. The caller audits.';

-- -----------------------------------------------------------------------------
-- run_financial_integrity_check (§65)
--
-- The scheduled reporter. Takes the advisory lock, records a `job_runs` row,
-- counts mismatches by check, and finishes. It repairs nothing — the whole
-- point is that a human sees the number and decides.
--
-- The lock is taken, held and released within this one call: a begin/finish
-- split leaks the lock under Supavisor, where the next statement may arrive on
-- a different session.
-- -----------------------------------------------------------------------------

create or replace function public.run_financial_integrity_check()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_type text := 'financial_integrity_check';
  v_job_id   uuid;
  v_started  timestamptz := clock_timestamp();
  v_counts   jsonb;
  v_total    integer := 0;
begin
  if not pg_try_advisory_lock(hashtext(v_job_type)) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  insert into public.job_runs (job_type, status)
  values (v_job_type, 'running')
  returning id into v_job_id;

  begin
    select coalesce(jsonb_object_agg(check_name, n), '{}'::jsonb), coalesce(sum(n), 0)
    into v_counts, v_total
    from (
      select check_name, count(*)::integer as n
      from public.check_financial_integrity(null)
      group by check_name
    ) grouped;

    update public.job_runs
    set status       = 'succeeded',
        completed_at = now(),
        duration_ms  = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
        -- The findings live here rather than in a table of their own: they are
        -- derived, so a stored copy would go stale the moment anything is
        -- fixed, and a stale integrity report is worse than none.
        metadata     = jsonb_build_object('mismatches', v_total, 'by_check', v_counts)
    where id = v_job_id;

  exception when others then
    update public.job_runs
    set status       = 'failed',
        completed_at = now(),
        duration_ms  = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
        error_code   = sqlstate,
        metadata     = jsonb_build_object('error', left(sqlerrm, 500))
    where id = v_job_id;

    perform pg_advisory_unlock(hashtext(v_job_type));
    raise;
  end;

  perform pg_advisory_unlock(hashtext(v_job_type));
  return jsonb_build_object('mismatches', v_total, 'by_check', v_counts);
end;
$$;

-- -----------------------------------------------------------------------------
-- Grants — §71, and the Phase 07 lesson
--
-- `revoke ... from anon, authenticated` is a NO-OP for a function: PUBLIC holds
-- EXECUTE by default and those roles inherit it. Revoking from PUBLIC is what
-- actually closes the door. This is the same mistake 20260914000200 fixed
-- across sixteen functions.
-- -----------------------------------------------------------------------------

revoke all on function public.derive_account_balance(uuid) from public;
revoke all on function public.check_financial_integrity(uuid) from public;
revoke all on function public.repair_account_balance(uuid) from public;
revoke all on function public.run_financial_integrity_check() from public;

grant execute on function public.derive_account_balance(uuid) to service_role;
grant execute on function public.check_financial_integrity(uuid) to service_role;
grant execute on function public.repair_account_balance(uuid) to service_role;
grant execute on function public.run_financial_integrity_check() to service_role;

-- -----------------------------------------------------------------------------
-- Schedule (§65) — daily, guarded the same way Phase 07's is.
-- -----------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'financial_integrity_check') then
    perform cron.unschedule('financial_integrity_check');
  end if;

  -- Daily rather than hourly: drift is not urgent, and this scans every
  -- account for every user. 04:40 UTC is 12:40pm in Manila — deliberately not
  -- on the hour, where it would contend with the generation job.
  perform cron.schedule(
    'financial_integrity_check',
    '40 4 * * *',
    $cron$ select public.run_financial_integrity_check() $cron$
  );

  raise notice 'pg_cron: financial_integrity_check scheduled daily';
exception when others then
  raise warning 'pg_cron unavailable (%): run public.run_financial_integrity_check() from the admin screen instead.', sqlerrm;
end $$;
