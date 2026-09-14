-- =============================================================================
-- Phase 13 — Admin and Operations: support notes, overrides, adjustments
--
-- Three tables that exist for one reason, stated in DATA-MODEL.md: **to avoid
-- falsifying primary records.**
--
-- Promotional Premium is an `entitlement_overrides` row, not a subscription row
-- invented to look like a purchase. A goodwill usage credit is a
-- `usage_adjustments` row, not an edit to `usage_records`. In both cases the
-- alternative — writing the lie into the primary table — is cheaper today and
-- unrecoverable later: nothing afterwards can tell an operator's kindness apart
-- from a real payment or a real scan.
--
-- ## Access
--
-- These are OPERATIONAL tables. Unlike every user-owned table since Phase 02,
-- they get no SELECT-own policy, because none of these rows belongs to the user
-- they are about: a support note is written by an admin about someone, and
-- letting that someone read it changes what admins are willing to write down.
-- RLS is enabled and forced, everything is revoked, and no policy exists — so
-- the browser role cannot reach them at all, whatever a future query attempts.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- admin_support_notes (§16)
-- -----------------------------------------------------------------------------

create table if not exists public.admin_support_notes (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- `set null`, not cascade: deleting a departed admin's account must not erase
  -- the support history of the users they helped.
  admin_user_id uuid references auth.users (id) on delete set null,
  note          text not null,
  created_at    timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_support_notes_note_check'
  ) then
    alter table public.admin_support_notes add constraint admin_support_notes_note_check
      check (char_length(btrim(note)) between 1 and 4000);
  end if;
end $$;

create index if not exists admin_support_notes_user_idx
  on public.admin_support_notes (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- entitlement_overrides (§19)
--
-- A per-user override of one entitlement key, for a window of time.
--
-- `value_json` deliberately matches `plan_entitlements.value_json`, because
-- `resolveEntitlements()` already reduces rows of that exact shape into a map
-- where a later row wins. An override in effect is therefore appended after the
-- plan's rows and needs no second resolution path — one place decides what a
-- user is entitled to, which is what stops the two answers drifting.
-- -----------------------------------------------------------------------------

create table if not exists public.entitlement_overrides (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  entitlement_key text not null,
  value_json      jsonb not null,
  -- §54 — never optional. An override with no reason is indistinguishable from
  -- a mistake six months later.
  reason          text not null,
  starts_at       timestamptz not null default now(),
  -- Null means open-ended. Allowed, but the admin UI defaults to a date:
  -- a promotion nobody remembers granting is a promotion nobody ends.
  ends_at         timestamptz,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entitlement_overrides_key_check'
  ) then
    -- The same keys `plan_entitlements` constrains. A typo here would resolve
    -- to nothing and look like the override silently failing.
    alter table public.entitlement_overrides add constraint entitlement_overrides_key_check
      check (entitlement_key in (
        'ocr_monthly_limit', 'ai_monthly_limit', 'advanced_analytics',
        'forecast_horizon_days', 'export_enabled', 'ads_shown',
        'document_retention_days', 'max_documents', 'max_accounts',
        'premium_support'
      ));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'entitlement_overrides_window_check'
  ) then
    alter table public.entitlement_overrides add constraint entitlement_overrides_window_check
      check (ends_at is null or ends_at > starts_at);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'entitlement_overrides_reason_check'
  ) then
    alter table public.entitlement_overrides add constraint entitlement_overrides_reason_check
      check (char_length(btrim(reason)) between 3 and 500);
  end if;
end $$;

-- The lookup `getEffectivePlan` performs on every request: this user's
-- overrides that are in effect now.
create index if not exists entitlement_overrides_active_idx
  on public.entitlement_overrides (user_id, starts_at, ends_at);

-- -----------------------------------------------------------------------------
-- usage_adjustments (§23)
--
-- A signed credit or debit against a metered feature, recorded separately from
-- the usage it adjusts. §32 of Phase 09 says usage already spent is not erased;
-- this is how a refund of one is expressed without contradicting that.
-- -----------------------------------------------------------------------------

create table if not exists public.usage_adjustments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users (id) on delete cascade,
  feature_key     text not null,
  -- Signed. Negative gives a user back a scan that HelloPera's own failure
  -- consumed; positive exists for the rarer correction in the other direction.
  quantity_delta  integer not null,
  reason          text not null,
  created_by      uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'usage_adjustments_feature_check'
  ) then
    alter table public.usage_adjustments add constraint usage_adjustments_feature_check
      check (feature_key in ('ocr_jobs', 'ai_queries', 'document_uploads', 'exports'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'usage_adjustments_delta_check'
  ) then
    -- Zero is not an adjustment, and a bounded magnitude turns a slipped digit
    -- into a refusal rather than a year of free scans.
    alter table public.usage_adjustments add constraint usage_adjustments_delta_check
      check (quantity_delta <> 0 and abs(quantity_delta) <= 1000);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'usage_adjustments_reason_check'
  ) then
    alter table public.usage_adjustments add constraint usage_adjustments_reason_check
      check (char_length(btrim(reason)) between 3 and 500);
  end if;
end $$;

create index if not exists usage_adjustments_user_idx
  on public.usage_adjustments (user_id, created_at desc);

-- -----------------------------------------------------------------------------
-- RLS (criterion 19, criterion 21)
--
-- Enabled, forced, everything revoked, and NO policy on any of the three. A
-- table with RLS on and no policy is readable by nobody through the browser
-- role, which is the intent — these are operational records about users, not
-- records belonging to them.
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'admin_support_notes', 'entitlement_overrides', 'usage_adjustments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- §14 — a user can never make themselves an admin
--
-- Today this trigger cannot fire from a browser: `authenticated` holds only
-- SELECT on `profiles` (Phase 01), so there is no client UPDATE to intercept.
-- It is written anyway, and the reason is worth stating plainly rather than
-- overselling.
--
-- "No write path exists" is a property of the *grants*, and grants change. The
-- obvious future change — letting people edit their own name without a round
-- trip through a server action — is one `grant update` away, and it would
-- silently hand every user `role` and `status` as well. This trigger is what
-- makes that a refusal instead of a privilege-escalation bug, and it costs one
-- function.
--
-- The service role is exempt (`auth.uid()` is null for it): admin actions run
-- through it, after `requireAdminAction()` has checked the caller.
-- -----------------------------------------------------------------------------

create or replace function public.reject_self_privilege_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Trusted server paths only. `auth.uid()` is null for the service role.
  if (select auth.uid()) is null then
    return new;
  end if;

  if new.role is distinct from old.role then
    raise exception 'role cannot be changed from the client'
      using errcode = 'insufficient_privilege';
  end if;

  if new.status is distinct from old.status then
    raise exception 'status cannot be changed from the client'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end $$;

revoke all on function public.reject_self_privilege_change() from public;

drop trigger if exists profiles_reject_self_privilege_change on public.profiles;
create trigger profiles_reject_self_privilege_change
  before update on public.profiles
  for each row execute function public.reject_self_privilege_change();
