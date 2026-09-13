-- =============================================================================
-- Phase 01 — Authentication, RBAC and Security
--
-- Creates: profiles, audit_logs, the profile-creation trigger, and RLS.
--
-- Write-path rule (master plan §33):
--   The browser role gets SELECT on its own rows and nothing else.
--   Every INSERT / UPDATE / DELETE goes through a server action using the
--   service role, which checks ownership in code before writing.
--
-- Rationale: with the anon key the browser reaches PostgREST directly, so RLS
-- cannot distinguish the service layer from devtools. A column the client
-- never sends is a column the client cannot set.
--
-- Idempotent: safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- profiles
-- -----------------------------------------------------------------------------

create table if not exists public.profiles (
  id               uuid primary key references auth.users (id) on delete cascade,
  email            text,
  full_name        text,
  avatar_url       text,
  role             text        not null default 'user',
  status           text        not null default 'active',
  -- Asia/Manila is assumed by phases 02, 03, 06, 07, 08, 09 and 12 for
  -- transaction dates, due-date comparison, analytics month boundaries,
  -- forecast dates, usage periods and relative date parsing. One
  -- authoritative value beats seven hardcoded strings.
  timezone         text        not null default 'Asia/Manila',
  default_currency text        not null default 'PHP',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.profiles is
  'Application-level user record. 1:1 with auth.users. role and status have no client-writable path.';

-- Constraints added defensively: Postgres has no ADD CONSTRAINT IF NOT EXISTS.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_role_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_role_check check (role in ('user', 'admin'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_status_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_status_check
      check (status in ('active', 'suspended', 'disabled'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_currency_check' and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_currency_check check (char_length(default_currency) = 3);
  end if;
end $$;

-- RLS policies filter on id; the primary key index already covers it.
-- Partial index for the admin lookup, which is rare and highly selective.
create index if not exists profiles_role_idx
  on public.profiles (role) where role = 'admin';

create index if not exists profiles_status_idx
  on public.profiles (status) where status <> 'active';

-- -----------------------------------------------------------------------------
-- audit_logs
--
-- Created with the FULL shape Phase 02 needs, not a reduced one. Phase 01 only
-- populates the auth-event columns and leaves entity/diff columns null — but
-- creating the narrow shape now would mean an ALTER on Phase 02's first day.
-- -----------------------------------------------------------------------------

create table if not exists public.audit_logs (
  id             uuid        primary key default gen_random_uuid(),
  actor_user_id  uuid        references auth.users (id) on delete set null,
  target_user_id uuid        references auth.users (id) on delete set null,
  entity_type    text,
  entity_id      uuid,
  event_type     text        not null,
  before_data    jsonb,
  after_data     jsonb,
  metadata       jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

comment on table public.audit_logs is
  'Append-only. No UPDATE or DELETE policy exists for any role, including the user who owns the row.';

create index if not exists audit_logs_target_created_idx
  on public.audit_logs (target_user_id, created_at desc);

create index if not exists audit_logs_entity_idx
  on public.audit_logs (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- updated_at maintenance
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Profile creation on signup
--
-- A database trigger rather than application code, so email/password and
-- Google OAuth produce identical results. Application-side creation would have
-- to be duplicated per provider and would silently skip if a signup path were
-- added later.
--
-- SECURITY DEFINER because it writes to a table the signing-up user has no
-- INSERT privilege on. search_path is pinned to empty to prevent search-path
-- hijacking — mandatory for any SECURITY DEFINER function.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url, role, status)
  values (
    new.id,
    new.email,
    -- Google returns full_name or name; email signup may send full_name.
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    -- Never read role from user metadata. OAuth metadata is attacker-adjacent
    -- and sign-up payloads are client-controlled.
    'user',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill any users that predate this migration.
insert into public.profiles (id, email, full_name, avatar_url, role, status)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name'),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture'),
  'user',
  'active'
from auth.users u
on conflict (id) do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles   enable row level security;
alter table public.profiles   force  row level security;
alter table public.audit_logs enable row level security;
alter table public.audit_logs force  row level security;

-- profiles: read own row only.
-- auth.uid() is wrapped in a subselect so it is evaluated once per query
-- rather than once per row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using (id = (select auth.uid()));

-- No INSERT / UPDATE / DELETE policy for `authenticated`, deliberately.
-- Inserts come from the trigger (SECURITY DEFINER); updates come from server
-- actions using the service role, which bypasses RLS and is never exposed to
-- the browser.

-- audit_logs: read own history. Append-only for everyone.
drop policy if exists audit_logs_select_own on public.audit_logs;
create policy audit_logs_select_own
  on public.audit_logs
  for select
  to authenticated
  using (target_user_id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- Least privilege
-- -----------------------------------------------------------------------------

revoke all on public.profiles   from anon, authenticated;
revoke all on public.audit_logs from anon, authenticated;

grant select on public.profiles   to authenticated;
grant select on public.audit_logs to authenticated;

-- anon gets nothing: an unauthenticated visitor has no rows to see.
