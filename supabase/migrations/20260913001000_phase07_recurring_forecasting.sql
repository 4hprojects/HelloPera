-- =============================================================================
-- Phase 07 — Recurring Transactions and Forecasting
--
-- CORE MODELLING RULE (§4, §12):
--   A recurring rule is not money. It is a statement about what is expected to
--   happen. Generating an occurrence creates an *expectation*, never a
--   transaction — only actual money movement does that, exactly as Phase 03
--   separates an obligation from the payment that settles it.
--
-- GENERATION ARCHITECTURE (§16, the "recommended hybrid"):
--   rule_type = bill             -> generates a real row in bills
--   rule_type = expected_income  -> generates a real row in expected_income
--   rule_type = income | expense -> generates expected_events
--
--   Bills and expected income already have lifecycle, allocation and display
--   status built in Phase 03; re-implementing those on expected_events would
--   be two sets of rules for one concept. Plain recurring income and expense
--   have no such home, so they get the generic row.
--
-- IDEMPOTENCY (§18, §60, §64):
--   Generation is defined by a uniqueness constraint, not by careful code.
--   Every generated row carries (recurring_rule_id, occurrence_date) with a
--   unique index, so a double-fired scheduler, an overlapping retry and a
--   lazy top-up on page load all collide harmlessly on insert.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- recurring_rules (§7)
-- -----------------------------------------------------------------------------

create table if not exists public.recurring_rules (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  rule_type            text not null,
  name                 text not null,
  description          text,
  amount               numeric(18, 2) not null,
  currency_code        text not null default 'PHP',
  frequency            text not null,
  interval_count       integer not null default 1,
  -- §10, §11 — which day the rule lands on. Null means "same day as start".
  day_of_month         integer,
  day_of_week          integer,
  start_date           date not null,
  end_date             date,
  -- The next date not yet generated. Advanced by the generator, never by a
  -- read, so a crashed run resumes rather than skipping.
  next_occurrence_date date,
  account_id           uuid references public.accounts (id) on delete set null,
  category_id          uuid references public.categories (id) on delete set null,
  -- Carried onto generated bills / expected income so the row reads naturally.
  provider_name        text,
  source_name          text,
  is_active            boolean not null default true,
  is_paused            boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_type_check') then
    alter table public.recurring_rules add constraint recurring_rules_type_check
      check (rule_type in ('income', 'expense', 'bill', 'expected_income'));
  end if;

  -- §8 — a small, closed set. RRULE-style recurrence is explicitly out (§8).
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_frequency_check') then
    alter table public.recurring_rules add constraint recurring_rules_frequency_check
      check (frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));
  end if;

  -- §9 — "every N". Zero would generate the same date forever.
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_interval_check') then
    alter table public.recurring_rules add constraint recurring_rules_interval_check
      check (interval_count >= 1 and interval_count <= 52);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_amount_check') then
    alter table public.recurring_rules add constraint recurring_rules_amount_check
      check (amount > 0);
  end if;

  -- §10 — 29..31 are accepted and clamped to the month's last day at
  -- generation time; see lib/recurring/schedule.ts.
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_dom_check') then
    alter table public.recurring_rules add constraint recurring_rules_dom_check
      check (day_of_month is null or (day_of_month between 1 and 31));
  end if;

  -- §11 — ISO: 1 = Monday .. 7 = Sunday.
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_dow_check') then
    alter table public.recurring_rules add constraint recurring_rules_dow_check
      check (day_of_week is null or (day_of_week between 1 and 7));
  end if;

  -- §13 — an end before the start would generate nothing, silently.
  if not exists (select 1 from pg_constraint where conname = 'recurring_rules_dates_check') then
    alter table public.recurring_rules add constraint recurring_rules_dates_check
      check (end_date is null or end_date >= start_date);
  end if;
end $$;

create index if not exists recurring_rules_user_idx
  on public.recurring_rules (user_id, start_date);
-- The generator's own query: live rules with something still to generate.
create index if not exists recurring_rules_due_idx
  on public.recurring_rules (next_occurrence_date)
  where is_active and not is_paused;

drop trigger if exists recurring_rules_set_updated_at on public.recurring_rules;
create trigger recurring_rules_set_updated_at before update on public.recurring_rules
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- expected_events (§15)
--
-- Generic expectations for recurring income and expense. Bills and expected
-- income get native Phase 03 rows instead (§16).
-- -----------------------------------------------------------------------------

create table if not exists public.expected_events (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade,
  recurring_rule_id     uuid references public.recurring_rules (id) on delete cascade,
  event_type            text not null,
  name                  text not null,
  amount                numeric(18, 2) not null,
  currency_code         text not null default 'PHP',
  scheduled_date        date not null,
  status                text not null default 'scheduled',
  account_id            uuid references public.accounts (id) on delete set null,
  category_id           uuid references public.categories (id) on delete set null,
  -- §39, §40 — the transaction that fulfilled this expectation, if any.
  actual_transaction_id uuid references public.transactions (id) on delete set null,
  -- §43 — a user may exclude a single occurrence from the projection without
  -- skipping it, e.g. "this bonus is not certain enough to plan against".
  include_in_forecast   boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expected_events_type_check') then
    alter table public.expected_events add constraint expected_events_type_check
      check (event_type in ('income', 'expense', 'bill', 'expected_income'));
  end if;

  -- §15. `overdue` is NOT here: like Phase 03's display statuses it is derived
  -- from scheduled_date at read time, so it cannot be silently stale between
  -- scheduler runs.
  if not exists (select 1 from pg_constraint where conname = 'expected_events_status_check') then
    alter table public.expected_events add constraint expected_events_status_check
      check (status in ('scheduled', 'fulfilled', 'skipped', 'cancelled'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'expected_events_amount_check') then
    alter table public.expected_events add constraint expected_events_amount_check
      check (amount > 0);
  end if;

  -- A fulfilled event must say what fulfilled it, and an unfulfilled one must
  -- not pretend to (§39).
  if not exists (select 1 from pg_constraint where conname = 'expected_events_fulfilled_check') then
    alter table public.expected_events add constraint expected_events_fulfilled_check
      check (
        (status = 'fulfilled' and actual_transaction_id is not null)
        or (status <> 'fulfilled' and actual_transaction_id is null)
      );
  end if;
end $$;

-- §18 — the whole of idempotent generation, in one line. A rule cannot
-- produce the same date twice no matter how many schedulers fire.
create unique index if not exists expected_events_rule_date_uidx
  on public.expected_events (recurring_rule_id, scheduled_date)
  where recurring_rule_id is not null;

create index if not exists expected_events_user_date_idx
  on public.expected_events (user_id, scheduled_date);
create index if not exists expected_events_forecast_idx
  on public.expected_events (user_id, scheduled_date)
  where status = 'scheduled' and include_in_forecast;

drop trigger if exists expected_events_set_updated_at on public.expected_events;
create trigger expected_events_set_updated_at before update on public.expected_events
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Generated Phase 03 rows (§16, §18)
--
-- A recurring bill produces a real bill, so it inherits Phase 03's lifecycle,
-- allocation and derived status for free. The provenance columns are what make
-- that generation idempotent.
-- -----------------------------------------------------------------------------

alter table public.bills
  add column if not exists recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  add column if not exists occurrence_date date;

alter table public.expected_income
  add column if not exists recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  add column if not exists occurrence_date date;

create unique index if not exists bills_rule_occurrence_uidx
  on public.bills (recurring_rule_id, occurrence_date)
  where recurring_rule_id is not null;

create unique index if not exists expected_income_rule_occurrence_uidx
  on public.expected_income (recurring_rule_id, occurrence_date)
  where recurring_rule_id is not null;

-- -----------------------------------------------------------------------------
-- job_runs (§20a)
--
-- Introduced here because this is the first scheduler. Phases 08, 11, 13 and
-- 14 reuse it; PHASE-13 §48-51 builds the admin view over it rather than
-- inventing it late, by which point three phases would have run unprotected.
--
-- No user_id: these are system runs, not user data. Phase 13's admin view is
-- the only reader, so the table is not exposed to the client at all.
-- -----------------------------------------------------------------------------

create table if not exists public.job_runs (
  id           uuid primary key default gen_random_uuid(),
  job_type     text not null,
  status       text not null default 'running',
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms  integer,
  error_code   text,
  metadata     jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'job_runs_status_check') then
    alter table public.job_runs add constraint job_runs_status_check
      check (status in ('running', 'succeeded', 'failed', 'partial'));
  end if;
end $$;

create index if not exists job_runs_type_started_idx
  on public.job_runs (job_type, started_at desc);
-- Finding a wedged run: one that claims to be running and never finished.
create index if not exists job_runs_running_idx
  on public.job_runs (job_type) where status = 'running';

-- -----------------------------------------------------------------------------
-- RLS
--
-- Client reads its own rows; every write goes through a server action
-- (master plan §33). `job_runs` is not user data and is not exposed at all.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['recurring_rules', 'expected_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t || '_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.job_runs enable row level security;
alter table public.job_runs force  row level security;
revoke all on public.job_runs from anon, authenticated;
