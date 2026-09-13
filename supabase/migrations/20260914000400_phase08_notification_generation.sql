-- =============================================================================
-- Phase 08 — notification generation
--
-- One scheduled function, reusing Phase 07's job infrastructure (§17 of this
-- phase, §20a of Phase 07): advisory lock, job_runs bookkeeping, pg_cron.
--
-- ## What this function may and may not do
--
-- It READS financial tables and WRITES only `notifications` (§4). It never
-- marks a bill paid, creates a transaction or confirms an extraction. If that
-- ever changes, the phase's core principle has been broken.
--
-- ## Why the inserts are bare `on conflict do nothing`
--
-- The unique index on (user_id, dedupe_key) is the deduplication guarantee
-- (§18, §61). Every insert below relies on it rather than checking first:
-- a read-then-write loses the race between "does this exist?" and "insert",
-- which is precisely the case two concurrent schedulers produce.
--
-- ## Preferences are checked in SQL, not after the fact
--
-- §42 — a user who switched a category off must not have rows created and then
-- filtered at display time, because push delivery reads the row, not the view.
--
-- ## Copy is NOT generated here
--
-- `metadata` carries the facts; `lib/notifications/copy.ts` renders the
-- sentence. Building prose in SQL would put the wording beyond reach of a test
-- and freeze it into rows already queued.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Ensure every user has a preferences row.
--
-- Created on demand rather than by a signup trigger, so users who registered
-- before this phase are covered too. Defaults come from the column defaults,
-- which §9 already made non-intrusive.
-- -----------------------------------------------------------------------------

create or replace function public.ensure_notification_preferences(p_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notification_preferences (user_id, timezone)
  select p_user_id, coalesce(p.timezone, 'Asia/Manila')
    from public.profiles p where p.id = p_user_id
  on conflict (user_id) do nothing;
$$;

revoke all on function public.ensure_notification_preferences from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- run_notification_generation (§34, §35, §36, §59, §61)
--
-- Hourly. Every date comparison resolves in the USER's timezone (§33): a bill
-- due "today" is today where the user lives, not where the database runs.
--
-- Windows and the escalation ladder mirror lib/notifications/rules.ts. §10
-- says not to hardcode them in multiple places; they exist twice because the
-- scheduler runs in Postgres (Phase 07 §2) and the app renders in TypeScript.
-- `lib/notifications/sql-parity.test.ts` holds the two copies to the same
-- numbers.
-- -----------------------------------------------------------------------------

create or replace function public.run_notification_generation(
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_type   text := 'notification_generation';
  v_lock_key   text;
  v_job_id     uuid;
  v_u          record;
  v_today      date;
  v_created    integer := 0;
  -- GET DIAGNOSTICS assigns a plain variable, never an expression.
  v_n          integer := 0;
  v_users      integer := 0;
  v_status     text := 'succeeded';
  v_error      text := null;

  -- Mirrors DUE_SOON_DAYS in lib/notifications/rules.ts.
  c_bill_soon       constant integer := 3;
  c_receivable_soon constant integer := 3;
  c_income_soon     constant integer := 1;
  c_event_soon      constant integer := 1;
  -- Mirrors ESCALATION_STEPS.
  c_steps           constant integer[] := array[1, 7, 30];
  -- §65 — not immediately after upload.
  c_ocr_hours       constant integer := 24;
begin
  v_lock_key := case when p_user_id is null then v_job_type
                     else v_job_type || ':' || p_user_id::text end;

  if not pg_try_advisory_lock(hashtext(v_lock_key)) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  insert into public.job_runs (job_type, status) values (v_job_type, 'running')
  returning id into v_job_id;

  begin
    for v_u in
      select p.id as user_id, coalesce(p.timezone, 'Asia/Manila') as tz, p.status as user_status
        from public.profiles p
       where (p_user_id is null or p.id = p_user_id)
    loop
      -- §43 — a suspended or disabled account does not receive ordinary
      -- financial reminders. Nudging someone to pay a bill on an account they
      -- cannot open is the wrong message at the wrong time.
      if v_u.user_status is distinct from 'active' then
        continue;
      end if;

      perform public.ensure_notification_preferences(v_u.user_id);
      v_users := v_users + 1;

      -- §33 — the user's own date, never the scheduler's.
      v_today := (now() at time zone v_u.tz)::date;

      -- ---------------------------------------------------------------------
      -- Bills (§11)
      -- ---------------------------------------------------------------------

      -- Due soon: exactly N days out, so it fires once per bill per due date.
      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select b.user_id, 'bill_due_soon', 'bill', b.id,
             'bill:' || b.id || ':due_soon:' || b.due_date,
             jsonb_build_object('name', b.provider_name, 'amount', b.amount,
                                'currency', b.currency_code,
                                'days', b.due_date - v_today, 'date', b.due_date),
             now() + interval '14 days'
        from public.bills b
        join public.notification_preferences np on np.user_id = b.user_id
       where b.user_id = v_u.user_id
         and np.bill_due_soon
         and not b.is_archived
         and b.status in ('open', 'partially_paid')
         and b.due_date = v_today + c_bill_soon
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select b.user_id, 'bill_due_today', 'bill', b.id,
             'bill:' || b.id || ':due_today:' || b.due_date,
             jsonb_build_object('name', b.provider_name, 'amount', b.amount,
                                'currency', b.currency_code, 'days', 0,
                                'date', b.due_date),
             now() + interval '14 days'
        from public.bills b
        join public.notification_preferences np on np.user_id = b.user_id
       where b.user_id = v_u.user_id
         and np.bill_due_soon
         and not b.is_archived
         and b.status in ('open', 'partially_paid')
         and b.due_date = v_today
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- Overdue: keyed on the escalation STEP, not the day. `due_date < today`
      -- stays true forever; stepping is what turns it into three reminders
      -- rather than one or thirty (§17, §48).
      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select b.user_id, 'bill_overdue', 'bill', b.id,
             'bill:' || b.id || ':overdue:' || s.step,
             jsonb_build_object('name', b.provider_name, 'amount', b.amount,
                                'currency', b.currency_code,
                                'days', b.due_date - v_today, 'date', b.due_date,
                                'step', s.step),
             now() + interval '30 days'
        from public.bills b
        join public.notification_preferences np on np.user_id = b.user_id
        cross join lateral (
          -- The highest step reached, matching escalationStepFor().
          select max(x) as step from unnest(c_steps) x
           where v_today - b.due_date >= x
        ) s
       where b.user_id = v_u.user_id
         and np.bill_overdue
         and not b.is_archived
         and b.status in ('open', 'partially_paid')
         and b.due_date < v_today
         and s.step is not null
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- ---------------------------------------------------------------------
      -- Receivables (§12)
      -- ---------------------------------------------------------------------

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select r.user_id, 'receivable_due_soon', 'receivable', r.id,
             'receivable:' || r.id || ':due_soon:' || r.due_date,
             jsonb_build_object('name', r.party_name, 'amount', r.amount,
                                'currency', r.currency_code,
                                'days', r.due_date - v_today, 'date', r.due_date),
             now() + interval '14 days'
        from public.receivables r
        join public.notification_preferences np on np.user_id = r.user_id
       where r.user_id = v_u.user_id
         and np.receivable_due_soon
         and not r.is_archived
         and r.status in ('open', 'partially_paid')
         and r.due_date is not null
         and r.due_date = v_today + c_receivable_soon
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select r.user_id, 'receivable_overdue', 'receivable', r.id,
             'receivable:' || r.id || ':overdue:' || s.step,
             jsonb_build_object('name', r.party_name, 'amount', r.amount,
                                'currency', r.currency_code,
                                'days', r.due_date - v_today, 'date', r.due_date,
                                'step', s.step),
             now() + interval '30 days'
        from public.receivables r
        join public.notification_preferences np on np.user_id = r.user_id
        cross join lateral (
          select max(x) as step from unnest(c_steps) x where v_today - r.due_date >= x
        ) s
       where r.user_id = v_u.user_id
         and np.receivable_overdue
         and not r.is_archived
         and r.status in ('open', 'partially_paid')
         and r.due_date is not null
         and r.due_date < v_today
         and s.step is not null
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- ---------------------------------------------------------------------
      -- Expected income (§13)
      --
      -- "Missed", never "overdue": nobody owes this and nothing is late.
      -- ---------------------------------------------------------------------

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select e.user_id, 'expected_income_upcoming', 'expected_income', e.id,
             'expected_income:' || e.id || ':upcoming:' || e.expected_date,
             jsonb_build_object('name', e.source_name, 'amount', e.amount,
                                'currency', e.currency_code,
                                'days', e.expected_date - v_today,
                                'date', e.expected_date),
             now() + interval '14 days'
        from public.expected_income e
        join public.notification_preferences np on np.user_id = e.user_id
       where e.user_id = v_u.user_id
         and np.expected_income
         and not e.is_archived
         and e.status in ('open', 'partially_paid')
         and e.expected_date = v_today + c_income_soon
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- Missed fires once, on the day after the expected date. There is no
      -- ladder: chasing someone about money that simply did not arrive, three
      -- times over a month, is nagging about something they cannot act on.
      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select e.user_id, 'expected_income_missed', 'expected_income', e.id,
             'expected_income:' || e.id || ':missed:' || e.expected_date,
             jsonb_build_object('name', e.source_name, 'amount', e.amount,
                                'currency', e.currency_code,
                                'days', e.expected_date - v_today,
                                'date', e.expected_date),
             now() + interval '30 days'
        from public.expected_income e
        join public.notification_preferences np on np.user_id = e.user_id
       where e.user_id = v_u.user_id
         and np.expected_income
         and not e.is_archived
         and e.status in ('open', 'partially_paid')
         and e.expected_date = v_today - 1
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- ---------------------------------------------------------------------
      -- Recurring events (§14)
      -- ---------------------------------------------------------------------

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select ev.user_id, 'recurring_event_upcoming', 'expected_event', ev.id,
             'recurring_event:' || ev.id || ':upcoming:' || ev.scheduled_date,
             jsonb_build_object('name', ev.name, 'amount', ev.amount,
                                'currency', ev.currency_code,
                                'days', ev.scheduled_date - v_today,
                                'date', ev.scheduled_date),
             now() + interval '7 days'
        from public.expected_events ev
        join public.notification_preferences np on np.user_id = ev.user_id
       where ev.user_id = v_u.user_id
         and np.recurring_events
         -- Only still-expected occurrences. A skipped or already-recorded one
         -- is not something to remind anybody about (Phase 07 §41, §42).
         and ev.status = 'scheduled'
         and ev.scheduled_date = v_today + c_event_soon
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- ---------------------------------------------------------------------
      -- OCR review (§15, §65)
      --
      -- One reminder, once the extraction has sat unreviewed for 24 hours.
      -- Reminding at upload time would fire while the user is still looking
      -- at the screen they uploaded from.
      -- ---------------------------------------------------------------------

      insert into public.notifications
        (user_id, type, entity_type, entity_id, dedupe_key, metadata, expires_at)
      select x.user_id, 'ocr_review_required', 'extraction', x.id,
             'ocr_review:' || x.id || ':1',
             jsonb_build_object('count', 1, 'date', x.created_at::date),
             now() + interval '30 days'
        from public.extraction_results x
        join public.notification_preferences np on np.user_id = x.user_id
       where x.user_id = v_u.user_id
         and np.ocr_review
         and x.status = 'pending_review'
         and x.created_at < now() - make_interval(hours => c_ocr_hours)
      on conflict do nothing;
      get diagnostics v_n = row_count; v_created := v_created + v_n;

      -- ---------------------------------------------------------------------
      -- Forecast shortfall (§16, §64)
      --
      -- Mirrors projectBalance() in lib/forecast/project.ts: opening liquid
      -- cash, plus dated inflows, minus dated outflows, walked day by day; the
      -- FIRST day the running balance goes below zero is the one reported.
      --
      -- Written here rather than called from the app because §19 says
      -- generation must not depend on the user opening a page — and a
      -- shortfall warning that only appears once you look at the forecast is
      -- precisely the warning you did not get.
      --
      -- §64's "do not notify on every recalculation" is handled by the dedupe
      -- key, which carries the shortfall DATE: an unchanged projection reuses
      -- the key and stays quiet, while a shortfall that moves earlier is a new
      -- key and notifies again.
      -- ---------------------------------------------------------------------

      if exists (select 1 from public.notification_preferences np
                  where np.user_id = v_u.user_id and np.forecast_shortfall) then

        declare
          v_currency text;
          v_opening  numeric(18,2);
          v_first    date;
          v_amount   numeric(18,2);
        begin
          select coalesce(p.default_currency, 'PHP') into v_currency
            from public.profiles p where p.id = v_u.user_id;

          -- §32 of Phase 07 — liquid ASSET accounts only. An investment is not
          -- money to spend this month, and a liability balance is a debt.
          select coalesce(sum(a.current_balance), 0) into v_opening
            from public.accounts a
           where a.user_id = v_u.user_id
             and not a.is_archived
             and a.nature = 'asset'
             and a.type in ('cash', 'bank', 'gcash', 'maya', 'paypal')
             and a.currency_code = v_currency;

          with movements as (
            select b.due_date as d, -b.amount as delta
              from public.bills b
             where b.user_id = v_u.user_id and not b.is_archived
               and b.status in ('open', 'partially_paid')
               and b.currency_code = v_currency
               and b.due_date between v_today and v_today + 30
            union all
            select e.expected_date, e.amount
              from public.expected_income e
             where e.user_id = v_u.user_id and not e.is_archived
               and e.status in ('open', 'partially_paid')
               and e.currency_code = v_currency
               and e.expected_date between v_today and v_today + 30
            union all
            select ev.scheduled_date,
                   case when ev.event_type = 'income' then ev.amount else -ev.amount end
              from public.expected_events ev
             where ev.user_id = v_u.user_id
               -- Skipped, cancelled and already-recorded occurrences are out,
               -- and so are ones the user excluded from the projection.
               and ev.status = 'scheduled'
               and ev.include_in_forecast
               and ev.currency_code = v_currency
               and ev.scheduled_date between v_today and v_today + 30
            -- Receivables are deliberately absent: Phase 07 §31 keeps them out
            -- of the default projection, and a reminder must not be based on
            -- money less certain than the forecast page itself assumes.
          ),
          daily as (
            select d, sum(delta) as delta from movements group by d
          ),
          running as (
            select d, v_opening + sum(delta) over (order by d) as balance from daily
          )
          select r.d, -r.balance into v_first, v_amount
            from running r where r.balance < 0 order by r.d limit 1;

          if v_first is not null then
            insert into public.notifications
              (user_id, type, entity_type, dedupe_key, metadata, expires_at)
            values
              (v_u.user_id, 'forecast_shortfall', 'forecast',
               'forecast_shortfall:' || v_u.user_id || ':' || v_first,
               jsonb_build_object('date', v_first, 'amount', v_amount,
                                  'currency', v_currency),
               now() + interval '14 days')
            on conflict do nothing;
            get diagnostics v_n = row_count; v_created := v_created + v_n;
          end if;
        end;
      end if;

    end loop;

  exception when others then
    v_status := 'failed';
    v_error  := sqlstate;
  end;

  update public.job_runs
     set status = v_status, completed_at = now(),
         duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer,
         error_code = v_error,
         metadata = jsonb_build_object('users', v_users, 'created', v_created,
                                       'scoped_user', p_user_id)
   where id = v_job_id;

  perform pg_advisory_unlock(hashtext(v_lock_key));

  return jsonb_build_object('job_id', v_job_id, 'status', v_status,
                            'users', v_users, 'created', v_created,
                            'error_code', v_error);
end $$;

revoke all on function public.run_notification_generation from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.run_notification_generation to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Cleanup (§22, §73)
--
-- Expired and long-read notifications are deleted rather than kept forever.
-- A notification centre that never forgets becomes a place nobody looks.
-- -----------------------------------------------------------------------------

create or replace function public.run_notification_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_type text := 'notification_cleanup';
  v_job_id uuid;
  v_deleted integer := 0;
begin
  if not pg_try_advisory_lock(hashtext(v_job_type)) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  insert into public.job_runs (job_type, status) values (v_job_type, 'running')
  returning id into v_job_id;

  delete from public.notifications
   where (expires_at is not null and expires_at < now())
      or (read_at is not null and read_at < now() - interval '90 days');
  get diagnostics v_deleted = row_count;

  update public.job_runs
     set status = 'succeeded', completed_at = now(),
         duration_ms = (extract(epoch from (now() - started_at)) * 1000)::integer,
         metadata = jsonb_build_object('deleted', v_deleted)
   where id = v_job_id;

  perform pg_advisory_unlock(hashtext(v_job_type));
  return jsonb_build_object('job_id', v_job_id, 'deleted', v_deleted);
end $$;

revoke all on function public.run_notification_cleanup from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Schedule (§35) — hourly generation, daily cleanup.
--
-- Guarded exactly as Phase 07's is: pg_cron is not on every Supabase plan and
-- a hard failure here would block every later migration.
-- -----------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'notification_generation') then
    perform cron.unschedule('notification_generation');
  end if;
  perform cron.schedule('notification_generation', '5 * * * *',
                        $cron$ select public.run_notification_generation() $cron$);

  if exists (select 1 from cron.job where jobname = 'notification_cleanup') then
    perform cron.unschedule('notification_cleanup');
  end if;
  perform cron.schedule('notification_cleanup', '30 3 * * *',
                        $cron$ select public.run_notification_cleanup() $cron$);

  raise notice 'pg_cron: notification jobs scheduled';
exception when others then
  raise warning 'pg_cron unavailable (%): notifications will rely on the application-side check (PHASE-08 §19/§34). See PHASE-07 §2 for fallbacks.', sqlerrm;
end $$;
