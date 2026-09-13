-- =============================================================================
-- Phase 07 — generation orchestrator, schema corrections, and scheduling
--
-- Completes the Phase 07 database layer. Three concerns:
--
--   1. Columns §15 and §66 specify that the first migration did not create.
--   2. run_recurring_generation() — the function the scheduler calls. The
--      parts existed (generate_occurrence, advance_rule_cursor, begin_job,
--      finish_job); nothing orchestrated them, so nothing generated anything.
--   3. The pg_cron schedule itself (§2, §20).
--
-- ## On putting date arithmetic in SQL
--
-- The previous migration's header says the date math lives in TypeScript and
-- not here. That was right when SQL only had to insert one occurrence it was
-- handed. It cannot hold once Postgres owns the schedule (§2: HelloDeploy has
-- no scheduler, so generation runs in the database), because the job must
-- decide *which* dates to generate with no application in the loop.
--
-- So the walk is transcribed here, and `lib/recurring/sql-parity.test.ts`
-- asserts it still agrees with `lib/recurring/schedule.ts` across every
-- frequency, interval and month-end case. That is the same device
-- `lib/finance/sql-parity.test.ts` already uses for the balance matrix, and
-- for the same reason: two hand-written copies of one rule is how a system
-- drifts into showing a number its own repair job disagrees with.
--
-- The anchor rule is preserved exactly: occurrence N is computed from the
-- rule's START DATE, never from occurrence N-1. A rule on the 31st clamps to
-- 28 February and returns to 31 March. Walking from the previous occurrence
-- would move it permanently to the 28th.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Missing columns
-- -----------------------------------------------------------------------------

-- §66 — a user who edits a generated event must not have that edit erased by
-- the next regeneration. DATA-MODEL.md already documented this column; the
-- table never had it.
alter table public.expected_events
  add column if not exists detached_from_rule boolean not null default false;

-- §15 — provenance for events materialised into another table.
alter table public.expected_events
  add column if not exists source_entity_type text;
alter table public.expected_events
  add column if not exists source_entity_id   uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'expected_events_source_entity_type_check'
  ) then
    alter table public.expected_events
      add constraint expected_events_source_entity_type_check
      check (source_entity_type is null
             or source_entity_type in ('bill', 'expected_income', 'transaction'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Recurrence arithmetic (§8–§11)
--
-- occurrence_at(rule, step) — the transcription of occurrenceAt() in
-- lib/recurring/schedule.ts. Immutable and side-effect free, so it is safe to
-- call in a loop and cheap enough not to matter.
-- -----------------------------------------------------------------------------

create or replace function public.occurrence_at(
  p_frequency      text,
  p_interval_count integer,
  p_start_date     date,
  p_day_of_month   integer,
  p_day_of_week    integer,
  p_step           integer
)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_day_step   integer;
  v_month_step integer;
  v_base       date;
  v_shift      integer;
  v_anchor_day integer;
  v_months     integer;
  v_first      date;      -- first of the target month
  v_day        integer;
begin
  -- Weekly family: a plain day offset from a (possibly shifted) base.
  v_day_step := case p_frequency
                  when 'weekly'   then 7
                  when 'biweekly' then 14
                  else null
                end;

  if v_day_step is not null then
    v_base := p_start_date;
    -- §11 — shift forward to the named weekday; every later occurrence keeps
    -- the same offset. isodow: 1 = Monday .. 7 = Sunday, matching the TS.
    if p_day_of_week is not null then
      v_shift := (p_day_of_week - extract(isodow from p_start_date)::integer + 7) % 7;
      v_base  := v_base + v_shift;
    end if;
    return v_base + (p_step * v_day_step * p_interval_count);
  end if;

  -- Monthly family.
  v_month_step := case p_frequency
                    when 'monthly'   then 1
                    when 'quarterly' then 3
                    when 'yearly'    then 12
                    else 1
                  end;

  v_anchor_day := coalesce(p_day_of_month, extract(day from p_start_date)::integer);
  v_months     := p_step * v_month_step * p_interval_count;

  v_first := (date_trunc('month', p_start_date::timestamp)
              + make_interval(months => v_months))::date;

  -- §10 — clamp to the last valid day of the target month. Computed
  -- explicitly rather than leaning on interval arithmetic's own clamping, so
  -- the rule is visible and the parity test can check it.
  v_day := least(
    v_anchor_day,
    extract(day from (v_first + interval '1 month' - interval '1 day'))::integer
  );

  return v_first + (v_day - 1);
end $$;

revoke all on function public.occurrence_at from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 3. run_recurring_generation (§17, §19, §20, §20a, §59, §64, §65)
--
-- One function so the advisory lock is taken, held and released inside a
-- SINGLE call. begin_job/finish_job take a SESSION-level lock across two
-- separate round trips, which is correct for pg_cron (one session) but leaks
-- the lock under a pooler, where the unlock can land on a different backend
-- than the lock. §2's fallbacks are all HTTP-shaped, so that had to be closed
-- before one of them is ever used.
--
-- Idempotency does not depend on the lock. The unique indexes from the first
-- migration are what make a second run a no-op (§65: "the constraint is the
-- guarantee; the lock is the optimisation").
--
-- p_horizon_days defaults to 90 (§17) — never generate years ahead.
-- -----------------------------------------------------------------------------

create or replace function public.run_recurring_generation(
  p_horizon_days integer default 90,
  p_user_id      uuid    default null   -- null = every user; set for the lazy check
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_type    text := 'recurring_generation';
  -- The lock key is per-user for a scoped run and global for the scheduled
  -- one. Without this, one user opening /forecast would take the same lock the
  -- hourly job uses, and every other user's on-load generation in that moment
  -- would skip — a lock contending on work that never overlaps, since the two
  -- runs touch different rows.
  v_lock_key    text;
  v_job_id      uuid;
  v_rule        record;
  v_today       date;
  v_horizon_end date;
  v_step        integer;
  v_date        date;
  v_created     integer := 0;
  v_examined    integer := 0;
  v_rules       integer := 0;
  v_next        date;
  v_id          uuid;
  v_status      text := 'succeeded';
  v_error       text := null;
  v_max_steps   constant integer := 4000;  -- mirrors MAX_STEPS in schedule.ts
begin
  -- §20a — skip silently when another run owns this job type. Not an error:
  -- the schedule firing over a slow run is expected, not exceptional.
  v_lock_key := case
                  when p_user_id is null then v_job_type
                  else v_job_type || ':' || p_user_id::text
                end;

  if not pg_try_advisory_lock(hashtext(v_lock_key)) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  insert into public.job_runs (job_type, status)
  values (v_job_type, 'running')
  returning id into v_job_id;

  begin
    for v_rule in
      select r.*, coalesce(p.timezone, 'Asia/Manila') as tz
        from public.recurring_rules r
        -- LEFT, not INNER: a rule whose profile row is somehow missing must
        -- still generate (falling back to Asia/Manila) rather than silently
        -- stop producing occurrences with nothing to show why.
        left join public.profiles p on p.id = r.user_id
       where r.is_active
         and not r.is_paused
         and (p_user_id is null or r.user_id = p_user_id)
    loop
      -- §47, §2 — "today" is the user's local date. cron.schedule fires in
      -- UTC; deriving the date from that would generate a day early or late
      -- for every user west or east of it.
      v_today       := (now() at time zone v_rule.tz)::date;
      v_horizon_end := v_today + p_horizon_days;

      -- §13, §24 — an ended rule generates nothing further.
      if v_rule.end_date is not null and v_rule.end_date < v_today then
        continue;
      end if;

      v_rules := v_rules + 1;
      v_next  := null;

      for v_step in 0 .. v_max_steps loop
        v_date := public.occurrence_at(
          v_rule.frequency, v_rule.interval_count, v_rule.start_date,
          v_rule.day_of_month, v_rule.day_of_week, v_step
        );

        exit when v_date > v_horizon_end;
        exit when v_rule.end_date is not null and v_date > v_rule.end_date;

        -- §59 — never before start_date. Occurrences at or before today are
        -- still generated when they fall on/after the cursor, so a rule
        -- created mid-month does not silently lose its current occurrence.
        if v_date >= v_rule.start_date
           and v_date >= coalesce(v_rule.next_occurrence_date, v_rule.start_date)
        then
          v_examined := v_examined + 1;
          v_id := public.generate_occurrence(v_rule.id, v_date);
          -- null means the unique index rejected a duplicate: the idempotent
          -- path, and the reason a second run changes nothing (§64).
          if v_id is not null then
            v_created := v_created + 1;
          end if;
        end if;

        if v_date > v_today then
          v_next := least(coalesce(v_next, v_date), v_date);
        end if;
      end loop;

      -- Advance the cursor to the first occurrence still in the future. Left
      -- where it is when the horizon holds nothing further, so work resumes
      -- there rather than skipping dates never reached.
      if v_next is not null then
        perform public.advance_rule_cursor(v_rule.id, v_next);
      end if;
    end loop;

  exception when others then
    v_status := 'failed';
    v_error  := sqlstate;
  end;

  update public.job_runs
     set status       = v_status,
         completed_at = now(),
         duration_ms  = (extract(epoch from (now() - started_at)) * 1000)::integer,
         error_code   = v_error,
         metadata     = jsonb_build_object(
                          'rules', v_rules,
                          'examined', v_examined,
                          'created', v_created,
                          'horizon_days', p_horizon_days,
                          'scoped_user', p_user_id
                        )
   where id = v_job_id;

  perform pg_advisory_unlock(hashtext(v_lock_key));

  return jsonb_build_object(
    'job_id', v_job_id, 'status', v_status, 'rules', v_rules,
    'created', v_created, 'examined', v_examined, 'error_code', v_error
  );
end $$;

revoke all on function public.run_recurring_generation from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. Schedule (§2, §20)
--
-- Hourly rather than daily: rules belong to users in many timezones and the
-- job resolves "today" per user, so an hourly pass picks up each local
-- midnight within the hour. The body is a function call, not inline logic, so
-- the schedule stays stable while the logic changes and the same function can
-- be replayed manually by an admin (PHASE-13 §50).
--
-- Guarded: pg_cron is not available on every Supabase plan, and a migration
-- that hard-fails there would block every later migration. If this is skipped,
-- the lazy safety check in the application (§19) still generates on access —
-- correctness does not depend on cron, only timeliness.
-- -----------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;

  -- Re-scheduling the same job name would stack duplicate schedules.
  if exists (select 1 from cron.job where jobname = 'recurring_generation') then
    perform cron.unschedule('recurring_generation');
  end if;

  perform cron.schedule(
    'recurring_generation',
    '0 * * * *',
    $cron$ select public.run_recurring_generation() $cron$
  );

  raise notice 'pg_cron: recurring_generation scheduled hourly';
exception when others then
  -- insufficient_privilege, undefined_file, undefined_table — all mean the
  -- same thing operationally: no pg_cron here.
  raise warning 'pg_cron unavailable (%): recurring generation will rely on the application-side safety check (PHASE-07 §19). See PHASE-07 §2 for fallbacks.', sqlerrm;
end $$;
