-- =============================================================================
-- Phase 09 — Monetization Foundation
--
-- Creates: plans, plan_entitlements, subscriptions, usage_records,
--          subscription_events, feature_flags, and increment_usage().
--
-- ## The rule this schema exists to enforce
--
-- §4: capability is decided by ENTITLEMENTS, never by a plan name compared in
-- application code. Raising a limit must be a data change, not a deploy. That
-- is why `plan_entitlements` is a key/value table rather than a column per
-- feature — a new entitlement is an INSERT, not a migration.
--
-- ## Free is the absence of a row
--
-- §11 offers two models and recommends this one: a user with no paid
-- subscription resolves to Free. It keeps signup free of a write, and it makes
-- the fail-closed path the same as the default path — if subscription lookup
-- breaks, the answer is already Free (§53), rather than depending on a row
-- that might be missing.
--
-- ## Why the write policies are absent, specifically
--
-- §47: this is the phase where a client write would be most directly
-- profitable. An INSERT into `subscriptions` is free Premium; an UPDATE of
-- `usage_records.quantity` is an unlimited quota. Neither table gets an
-- INSERT/UPDATE/DELETE policy for the browser role, so neither has a
-- client-reachable path at all.
--
-- ## usage_records was owed by Phase 05
--
-- `PHASE-05` §60 and `DATA-MODEL.md` both say Phase 05 creates this table with
-- exactly the shape Phase 09 needs, so that Phase 09 adds enforcement without
-- a migration. It was never built. Creating it here is safe — nothing has
-- written to it, so there is no backfill — and it closes Phase 05's own
-- outstanding criterion.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- plans (§6, §7)
--
-- `code` is the logic key and is never a display name (§7). Pricing is
-- nullable because §6 says it stays provisional until the economics are
-- settled, and a placeholder price rendered as fact is worse than none.
-- -----------------------------------------------------------------------------

create table if not exists public.plans (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  name             text not null,
  description      text,
  is_active        boolean not null default true,
  -- Whether the plan appears on pricing surfaces. A grandfathered or internal
  -- plan stays active without being offered.
  is_public        boolean not null default true,
  billing_interval text,
  price_amount     numeric(18, 2),
  currency_code    text not null default 'PHP',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'plans_code_check') then
    alter table public.plans add constraint plans_code_check
      check (code in ('free', 'premium'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'plans_interval_check') then
    alter table public.plans add constraint plans_interval_check
      check (billing_interval is null or billing_interval in ('month', 'year'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- plan_entitlements (§8, §9)
--
-- `value_json` rather than a typed column because entitlements are genuinely
-- heterogeneous: a limit is a number, a capability is a boolean, and a horizon
-- is a number that will change. §9 warns against undocumented keys, so the
-- check constraint is the registry — a typo becomes an error rather than an
-- entitlement that silently resolves to its safe default forever.
-- -----------------------------------------------------------------------------

create table if not exists public.plan_entitlements (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references public.plans (id) on delete cascade,
  entitlement_key text not null,
  value_json      jsonb not null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'plan_entitlements_key_check'
  ) then
    alter table public.plan_entitlements add constraint plan_entitlements_key_check
      check (entitlement_key in (
        'ocr_monthly_limit',
        'ai_monthly_limit',
        'advanced_analytics',
        -- §24 — a NUMBER, not a boolean. Phase 07 builds 30/60/90 and says
        -- plainly that longer horizons extrapolate past the evidence, so the
        -- entitlement caps at what exists and raising it is a data change.
        'forecast_horizon_days',
        'export_enabled',
        -- §27 — `ads_shown`, deliberately NOT `ads_enabled`. Phase 10's
        -- system-wide kill switch is `ads_enabled_global`, and two controls
        -- one word apart with opposite scopes would be confused during the
        -- incident where the kill switch matters.
        'ads_shown',
        'document_retention_days',
        'max_documents',
        'max_accounts',
        'premium_support'
      ));
  end if;
end $$;

create unique index if not exists plan_entitlements_plan_key_uidx
  on public.plan_entitlements (plan_id, entitlement_key);

-- -----------------------------------------------------------------------------
-- subscriptions (§10, §11)
--
-- Provider columns are generic on purpose (§40): nothing Stripe-shaped or
-- Paddle-shaped belongs in business logic, so the adapter keeps its own detail
-- in `subscription_events.payload` and only the two ids surface here.
-- -----------------------------------------------------------------------------

create table if not exists public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  plan_id                  uuid not null references public.plans (id) on delete restrict,
  status                   text not null default 'inactive',
  provider                 text,
  provider_customer_id     text,
  provider_subscription_id text,
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  -- §41, §42 — modelled now so Phase 11 does not need a migration to start a
  -- trial or honour a grace period.
  trial_end                timestamptz,
  grace_period_end         timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'subscriptions_status_check') then
    alter table public.subscriptions add constraint subscriptions_status_check
      check (status in (
        'active', 'trialing', 'past_due', 'grace', 'cancelled', 'expired', 'inactive'
      ));
  end if;
end $$;

-- One live subscription per user. A second row would make "which plan is this
-- person on?" ambiguous, and §12 requires one answer.
create unique index if not exists subscriptions_user_uidx
  on public.subscriptions (user_id);

create index if not exists subscriptions_status_idx
  on public.subscriptions (status)
  where status in ('active', 'trialing', 'grace');

-- -----------------------------------------------------------------------------
-- usage_records (§14, §15, §16, §31)
--
-- Owed by Phase 05; see the header. The unique key is what makes the atomic
-- increment possible, which is what makes §31's race safe.
-- -----------------------------------------------------------------------------

create table if not exists public.usage_records (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  feature_key  text not null,
  -- Calendar month in the USER's timezone (§16, §18) — dates, not instants,
  -- because a period boundary is a calendar fact.
  period_start date not null,
  period_end   date not null,
  quantity     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'usage_records_feature_check') then
    alter table public.usage_records add constraint usage_records_feature_check
      check (feature_key in ('ocr_jobs', 'ai_queries', 'document_uploads', 'exports'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usage_records_quantity_check') then
    alter table public.usage_records add constraint usage_records_quantity_check
      check (quantity >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'usage_records_period_check') then
    alter table public.usage_records add constraint usage_records_period_check
      check (period_end >= period_start);
  end if;
end $$;

create unique index if not exists usage_records_user_feature_period_uidx
  on public.usage_records (user_id, feature_key, period_start);

-- -----------------------------------------------------------------------------
-- subscription_events (§37, §38)
--
-- Phase 11 writes these from webhooks. The unique key is what makes replay
-- safe: a provider that delivers the same event twice — which every provider
-- does — must not apply it twice.
-- -----------------------------------------------------------------------------

create table if not exists public.subscription_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid references auth.users (id) on delete set null,
  subscription_id   uuid references public.subscriptions (id) on delete set null,
  provider          text not null,
  provider_event_id text not null,
  event_type        text not null,
  payload           jsonb not null default '{}'::jsonb,
  processing_status text not null default 'pending',
  processed_at      timestamptz,
  created_at        timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'subscription_events_status_check'
  ) then
    alter table public.subscription_events add constraint subscription_events_status_check
      check (processing_status in ('pending', 'processed', 'failed', 'ignored'));
  end if;
end $$;

create unique index if not exists subscription_events_provider_event_uidx
  on public.subscription_events (provider, provider_event_id);

-- -----------------------------------------------------------------------------
-- feature_flags (§50, §51, §52)
--
-- System-wide kill switches, distinct from per-user entitlements. The
-- distinction that matters: `ads_enabled_global` turns off all advertising;
-- `ads_shown` decides whether a given user would have seen any. An ad renders
-- only when both permit it.
-- -----------------------------------------------------------------------------

create table if not exists public.feature_flags (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  enabled    boolean not null default false,
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

-- -----------------------------------------------------------------------------
-- Seed
--
-- Plans and their entitlements ship with the migration so a fresh database
-- resolves correctly with no application bootstrap. Values are §8's own
-- placeholders — `on conflict do nothing` so re-running never overwrites a
-- value an operator has since tuned.
-- -----------------------------------------------------------------------------

insert into public.plans (code, name, description, is_active, is_public, billing_interval)
values
  ('free', 'Free',
   'Everything you need to track your money by hand.', true, true, null),
  ('premium', 'Premium',
   'Higher limits, longer forecasts and no ads.', true, true, 'month')
on conflict (code) do nothing;

do $$
declare
  v_free    uuid;
  v_premium uuid;
begin
  select id into v_free    from public.plans where code = 'free';
  select id into v_premium from public.plans where code = 'premium';

  insert into public.plan_entitlements (plan_id, entitlement_key, value_json) values
    -- Free — §22: "Free should remain genuinely useful." A forecast the user
    -- has never seen is one they will not pay for (§24), so 30 days is free.
    (v_free, 'ocr_monthly_limit',       '30'::jsonb),
    (v_free, 'ai_monthly_limit',        '5'::jsonb),
    (v_free, 'advanced_analytics',      'false'::jsonb),
    (v_free, 'forecast_horizon_days',   '30'::jsonb),
    (v_free, 'export_enabled',          'false'::jsonb),
    (v_free, 'ads_shown',               'true'::jsonb),
    (v_free, 'document_retention_days', '30'::jsonb),
    -- null means no limit. §28: "Do not limit accounts unnecessarily unless
    -- needed for pricing." The key exists so it can be set without a
    -- migration; it is simply not used yet.
    (v_free, 'max_documents',           'null'::jsonb),
    (v_free, 'max_accounts',            'null'::jsonb),
    (v_free, 'premium_support',         'false'::jsonb),

    -- Premium — capped at what Phase 07 actually built (§24).
    (v_premium, 'ocr_monthly_limit',       '500'::jsonb),
    (v_premium, 'ai_monthly_limit',        '100'::jsonb),
    (v_premium, 'advanced_analytics',      'true'::jsonb),
    (v_premium, 'forecast_horizon_days',   '90'::jsonb),
    (v_premium, 'export_enabled',          'true'::jsonb),
    (v_premium, 'ads_shown',               'false'::jsonb),
    (v_premium, 'document_retention_days', '365'::jsonb),
    (v_premium, 'max_documents',           'null'::jsonb),
    (v_premium, 'max_accounts',            'null'::jsonb),
    (v_premium, 'premium_support',         'true'::jsonb)
  on conflict (plan_id, entitlement_key) do nothing;
end $$;

-- §50 — staged rollout switches. billing_enabled is OFF: §52 requires
-- HelloPera to work fully with monetization disabled, and that is the
-- development posture until Phase 11 has a real provider behind it.
insert into public.feature_flags (key, enabled, config) values
  ('billing_enabled',    false, '{"note": "Phase 11 turns this on with a real provider."}'::jsonb),
  ('premium_enabled',    false, '{}'::jsonb),
  ('ads_enabled_global', false, '{"note": "Phase 10 owns ad rendering."}'::jsonb),
  ('ai_enabled',         false, '{"note": "Phase 12."}'::jsonb),
  ('ocr_enabled',        true,  '{}'::jsonb),
  ('push_enabled',       true,  '{}'::jsonb)
on conflict (key) do nothing;

-- -----------------------------------------------------------------------------
-- increment_usage (§31)
--
-- Atomic by construction. The race §31 describes — 29/30, two OCR jobs start,
-- both read 29, both proceed — cannot happen here because the read and the
-- write are one statement and the unique index serialises them.
--
-- Returns the quantity AFTER incrementing, so the caller can compare against
-- the limit without a second read that could see a third writer's value.
-- -----------------------------------------------------------------------------

create or replace function public.increment_usage(
  p_user_id      uuid,
  p_feature_key  text,
  p_period_start date,
  p_period_end   date,
  p_quantity     integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quantity integer;
begin
  insert into public.usage_records
    (user_id, feature_key, period_start, period_end, quantity)
  values
    (p_user_id, p_feature_key, p_period_start, p_period_end, p_quantity)
  on conflict (user_id, feature_key, period_start) do update
    set quantity   = public.usage_records.quantity + excluded.quantity,
        updated_at = now()
  returning quantity into v_quantity;

  return v_quantity;
end $$;

revoke all on function public.increment_usage from public, anon, authenticated;

do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.increment_usage to service_role;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'plans', 'plan_entitlements', 'subscriptions', 'usage_records', 'feature_flags'
  ] loop
    execute format('drop trigger if exists %I_set_updated_at on public.%I', t, t);
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- RLS (§47, §48)
-- -----------------------------------------------------------------------------

-- User-owned: SELECT own rows, and no write policy of any kind. An INSERT here
-- is free Premium; an UPDATE of quantity is an unlimited quota.
do $$
declare t text;
begin
  foreach t in array array['subscriptions', 'usage_records'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I_select_own on public.%I', t, t);
    execute format(
      'create policy %I_select_own on public.%I for select to authenticated
       using (user_id = (select auth.uid()))', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Catalogue: readable by any signed-in user so the UI can render tiers and
-- explain what Premium includes (§47). Written only by migration or an
-- audited admin action.
do $$
declare t text;
begin
  foreach t in array array['plans', 'plan_entitlements'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('drop policy if exists %I_select_all on public.%I', t, t);
    execute format(
      'create policy %I_select_all on public.%I for select to authenticated
       using (true)', t, t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- Operational: no browser access at all, like job_runs. Feature flags are read
-- server-side; subscription events are raw provider payloads and may carry
-- billing detail that is none of the browser's business.
do $$
declare t text;
begin
  foreach t in array array['feature_flags', 'subscription_events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;
