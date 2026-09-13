-- =============================================================================
-- Phase 07 — occurrence generation and job bookkeeping
--
-- Two concerns, deliberately separate:
--
--   generate_occurrence()  inserts ONE occurrence for ONE rule, idempotently.
--   run_job_*()            the §20a advisory-lock and job_runs bookkeeping.
--
-- The date arithmetic is NOT here. It lives in lib/recurring/schedule.ts,
-- where it is unit-tested across month-end, leap years and DST — the cases
-- that actually break recurrence. SQL computes nothing it cannot be tested
-- on; it enforces uniqueness, which is the part that must be atomic.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- generate_occurrence (§16, §18, §60)
--
-- Routes by rule type to the right home, and relies on the unique indexes for
-- idempotency rather than a read-then-write check, which loses the race
-- outright: between "does it exist?" and "insert", a concurrent run has
-- already inserted.
--
-- Returns the id created, or null when the occurrence already existed.
-- -----------------------------------------------------------------------------

create or replace function public.generate_occurrence(
  p_rule_id         uuid,
  p_occurrence_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recurring_rules%rowtype;
  v_id uuid;
begin
  select * into r from public.recurring_rules where id = p_rule_id;
  if not found then
    raise exception 'RULE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- §21, §24 — a paused or ended rule generates nothing. Checked here as well
  -- as in the caller so a stale worklist cannot resurrect a stopped rule.
  if not r.is_active or r.is_paused then
    return null;
  end if;
  if p_occurrence_date < r.start_date then
    return null;
  end if;
  if r.end_date is not null and p_occurrence_date > r.end_date then
    return null;
  end if;

  if r.rule_type = 'bill' then
    insert into public.bills (
      user_id, provider_name, description, category_id, amount, currency_code,
      due_date, status, recurring_rule_id, occurrence_date
    ) values (
      r.user_id, coalesce(r.provider_name, r.name), r.description, r.category_id,
      r.amount, r.currency_code, p_occurrence_date, 'open', r.id, p_occurrence_date
    )
    on conflict do nothing
    returning id into v_id;

  elsif r.rule_type = 'expected_income' then
    insert into public.expected_income (
      user_id, source_name, description, category_id, amount, currency_code,
      expected_date, status, recurring_rule_id, occurrence_date
    ) values (
      r.user_id, coalesce(r.source_name, r.name), r.description, r.category_id,
      r.amount, r.currency_code, p_occurrence_date, 'open', r.id, p_occurrence_date
    )
    on conflict do nothing
    returning id into v_id;

  else
    insert into public.expected_events (
      user_id, recurring_rule_id, event_type, name, amount, currency_code,
      scheduled_date, status, account_id, category_id
    ) values (
      r.user_id, r.id, r.rule_type, r.name, r.amount, r.currency_code,
      p_occurrence_date, 'scheduled', r.account_id, r.category_id
    )
    on conflict do nothing
    returning id into v_id;
  end if;

  return v_id;
end $$;

revoke all on function public.generate_occurrence from anon, authenticated;

-- -----------------------------------------------------------------------------
-- advance_rule_cursor
--
-- Moves next_occurrence_date forward. Separate from generation so a failure
-- part-way through a rule's backlog leaves the cursor where work resumes,
-- rather than skipping the dates it had not reached.
-- -----------------------------------------------------------------------------

create or replace function public.advance_rule_cursor(
  p_rule_id uuid,
  p_next    date
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.recurring_rules
     set next_occurrence_date = p_next
   where id = p_rule_id;
$$;

revoke all on function public.advance_rule_cursor from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Job bookkeeping (§20a)
--
-- begin_job takes the advisory lock and opens a job_runs row, or returns null
-- when another run holds the lock. An advisory lock is released automatically
-- if the session dies, so a crashed run cannot wedge the schedule the way a
-- lock table would.
--
-- This is defence in depth. The unique indexes in the previous migration are
-- what make generation *correct*; the lock stops two runs wasting effort and
-- racing on the same rows.
-- -----------------------------------------------------------------------------

create or replace function public.begin_job(p_job_type text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not pg_try_advisory_lock(hashtext(p_job_type)) then
    return null;   -- another run owns this job type; exit without error
  end if;

  insert into public.job_runs (job_type, status)
  values (p_job_type, 'running')
  returning id into v_id;

  return v_id;
end $$;

create or replace function public.finish_job(
  p_job_id     uuid,
  p_job_type   text,
  p_status     text,
  p_error_code text default null,
  p_metadata   jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.job_runs
     set status       = p_status,
         completed_at = now(),
         duration_ms  = (extract(epoch from (now() - started_at)) * 1000)::integer,
         error_code   = p_error_code,
         metadata     = coalesce(p_metadata, '{}'::jsonb)
   where id = p_job_id;

  -- Released explicitly on the happy path; the session ending releases it
  -- anyway, which is what makes a crash safe.
  perform pg_advisory_unlock(hashtext(p_job_type));
end $$;

revoke all on function public.begin_job  from anon, authenticated;
revoke all on function public.finish_job from anon, authenticated;
