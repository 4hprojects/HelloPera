-- =============================================================================
-- Pre-public-launch gate — authentication rate limiting
--
-- Master plan §54a lists "Rate limiting active on authentication endpoints"
-- among the items that must pass before Phase 10 publishes anything.
-- PHASE-14 §38 marks it a partial gate item and extends coverage later.
--
-- ## Why Postgres and not memory
--
-- HelloDeploy runs a single replica, so an in-process counter would appear to
-- work — right up to the first redeploy or container restart, which resets
-- every limit at exactly the moment a deploy makes the service most
-- interesting to probe. A table survives restarts and is already here; Redis
-- is explicitly out of scope.
--
-- ## Operational, not user-owned
--
-- A rate-limit row is keyed by email or IP and exists before anyone is
-- authenticated, so it has no `user_id` and no browser access at all. Reading
-- it would tell an attacker exactly how many attempts remain.
--
-- Idempotent.
-- =============================================================================

create table if not exists public.rate_limits (
  -- "<action>:<identifier>", built by rateLimitKey() in
  -- lib/security/rate-limit.ts. The primary key IS the bucket, so there is no
  -- second index to keep and no ambiguity about which row to touch.
  key               text primary key,
  attempts          integer not null default 0,
  window_started_at timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'rate_limits_attempts_check') then
    alter table public.rate_limits add constraint rate_limits_attempts_check
      check (attempts >= 0);
  end if;
end $$;

-- Lets the cleanup job find stale buckets without scanning the table.
create index if not exists rate_limits_window_idx
  on public.rate_limits (window_started_at);

-- -----------------------------------------------------------------------------
-- check_rate_limit
--
-- Records an attempt and returns whether it is allowed, in ONE statement.
--
-- The check-then-increment alternative loses the race that matters: a
-- credential-stuffing script sends twenty requests at once, all twenty read
-- "3 attempts so far", and all twenty proceed. `insert … on conflict do
-- update` with the decision computed inside the statement cannot be
-- interleaved that way.
--
-- Returns (allowed, attempts, retry_after_seconds). The policy — limit and
-- window — is passed in rather than stored, so it stays in
-- lib/security/rate-limit.ts where it is documented and tested.
-- -----------------------------------------------------------------------------

create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
returns table (allowed boolean, attempts integer, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempts integer;
  v_started  timestamptz;
  v_elapsed  integer;
begin
  insert into public.rate_limits (key, attempts, window_started_at, updated_at)
  values (p_key, 1, now(), now())
  on conflict (key) do update
    set
      -- A window that has fully elapsed restarts at 1; otherwise this attempt
      -- adds to the running count. Both branches are evaluated inside the
      -- single UPDATE, so two concurrent callers serialise on the row lock.
      attempts = case
        when now() - public.rate_limits.window_started_at
             >= make_interval(secs => p_window_seconds)
        then 1
        else public.rate_limits.attempts + 1
      end,
      window_started_at = case
        when now() - public.rate_limits.window_started_at
             >= make_interval(secs => p_window_seconds)
        then now()
        else public.rate_limits.window_started_at
      end,
      updated_at = now()
  returning public.rate_limits.attempts, public.rate_limits.window_started_at
    into v_attempts, v_started;

  v_elapsed := greatest(0, floor(extract(epoch from (now() - v_started)))::integer);

  return query select
    v_attempts <= p_limit,
    v_attempts,
    case
      when v_attempts <= p_limit then 0
      else greatest(1, p_window_seconds - v_elapsed)
    end;
end $$;

revoke all on function public.check_rate_limit from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.check_rate_limit to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Cleanup
--
-- Buckets are worthless once their window has passed. Without this the table
-- grows one row per email anyone ever typed, forever.
-- -----------------------------------------------------------------------------

create or replace function public.run_rate_limit_cleanup()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_deleted integer;
begin
  delete from public.rate_limits where window_started_at < now() - interval '24 hours';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end $$;

revoke all on function public.run_rate_limit_cleanup from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS — operational, no browser access.
-- -----------------------------------------------------------------------------

alter table public.rate_limits enable row level security;
alter table public.rate_limits force row level security;
revoke all on public.rate_limits from anon, authenticated;

do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'rate_limit_cleanup') then
    perform cron.unschedule('rate_limit_cleanup');
  end if;
  perform cron.schedule('rate_limit_cleanup', '15 4 * * *',
                        $cron$ select public.run_rate_limit_cleanup() $cron$);

  raise notice 'pg_cron: rate_limit_cleanup scheduled daily';
exception when others then
  raise warning 'pg_cron unavailable (%): stale rate-limit rows will accumulate until cleaned manually.', sqlerrm;
end $$;
