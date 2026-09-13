-- =============================================================================
-- HelloPera — all pending migrations, in order.
--
-- Generated file. Paste this ENTIRE file into the Supabase SQL Editor and Run.
-- Every statement is idempotent, so re-running it is safe.
--
--   1. Phase 01 — profiles, audit_logs, signup trigger, RLS
--   2. Phase 02 — accounts, categories, transactions, tags, balance function
--   3. Phase 02 — atomic transaction RPCs
--
-- After this completes, run supabase/VERIFY-RLS.sql to confirm RLS is enforced.
-- =============================================================================


-- ======================================================================
-- 20260913000100_phase01_profiles_and_audit.sql
-- ======================================================================

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


-- ======================================================================
-- 20260913000200_phase02_financial_core.sql
-- ======================================================================

-- =============================================================================
-- Phase 02 — Financial Core
--
-- accounts, categories, transactions, tags, transaction_tags.
--
-- Two rules this schema enforces rather than trusts:
--
--   1. amount is ALWAYS positive. Direction comes from transaction type and
--      account role (see lib/finance/balance.ts), never from a stored sign.
--   2. accounts.opening_balance is input-only. The authoritative opening
--      amount is an opening_balance TRANSACTION. Summing both would make every
--      account wrong by exactly its opening amount, in a way that reconciles
--      against nothing.
--
-- Write-path rule (master plan §33): browser gets SELECT on own rows; all
-- mutations go through server actions using the service role.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- accounts
-- -----------------------------------------------------------------------------

create table if not exists public.accounts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users (id) on delete cascade,
  name             text not null,
  type             text not null,
  nature           text not null,
  currency_code    text not null default 'PHP',
  -- Input-only. Never summed. See header.
  opening_balance  numeric(18, 2) not null default 0,
  -- Cache. Always recomputable from transactions via recalculate_account_balance().
  current_balance  numeric(18, 2) not null default 0,
  institution_name text,
  is_active        boolean not null default true,
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on column public.accounts.opening_balance is
  'What the user typed when creating the account. Display and audit only — NEVER summed into a balance. The opening_balance transaction is authoritative.';
comment on column public.accounts.current_balance is
  'Cached. Derived from transactions; recomputable at any time. Never client-writable.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'accounts_type_check') then
    alter table public.accounts add constraint accounts_type_check
      check (type in ('cash','bank','gcash','maya','paypal','credit_card','loan','investment','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_nature_check') then
    alter table public.accounts add constraint accounts_nature_check
      check (nature in ('asset','liability'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_currency_check') then
    alter table public.accounts add constraint accounts_currency_check
      check (char_length(currency_code) = 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'accounts_name_check') then
    alter table public.accounts add constraint accounts_name_check
      check (char_length(btrim(name)) between 1 and 80);
  end if;
end $$;

create index if not exists accounts_user_idx on public.accounts (user_id);
create index if not exists accounts_user_active_idx
  on public.accounts (user_id) where is_archived = false;

drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- categories
--
-- System categories have user_id null and are readable by everyone.
-- -----------------------------------------------------------------------------

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  name        text not null,
  type        text not null,
  icon        text,
  is_system   boolean not null default false,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_type_check') then
    alter table public.categories add constraint categories_type_check
      check (type in ('income','expense','both'));
  end if;
  -- A system category must have no owner; a user category must have one.
  if not exists (select 1 from pg_constraint where conname = 'categories_ownership_check') then
    alter table public.categories add constraint categories_ownership_check
      check ((is_system and user_id is null) or (not is_system and user_id is not null));
  end if;
end $$;

create index if not exists categories_user_idx on public.categories (user_id);
create unique index if not exists categories_system_name_idx
  on public.categories (lower(name), type) where is_system;

drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- transactions
-- -----------------------------------------------------------------------------

create table if not exists public.transactions (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users (id) on delete cascade,
  type                     text not null,
  direction                text,
  amount                   numeric(18, 2) not null,
  currency_code            text not null default 'PHP',
  transaction_date         date not null,
  source_account_id        uuid references public.accounts (id) on delete restrict,
  destination_account_id   uuid references public.accounts (id) on delete restrict,
  category_id              uuid references public.categories (id) on delete set null,
  merchant_name            text,
  description              text,
  notes                    text,
  refund_of_transaction_id uuid references public.transactions (id) on delete set null,
  transfer_group_id        uuid,
  status                   text not null default 'confirmed',
  void_reason              text,
  is_archived              boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

comment on column public.transactions.amount is
  'ALWAYS positive. Direction is derived from type and account role — see lib/finance/balance.ts §34.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'transactions_amount_check') then
    alter table public.transactions add constraint transactions_amount_check
      check (amount > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_type_check') then
    alter table public.transactions add constraint transactions_type_check
      check (type in ('income','expense','transfer','refund','adjustment','opening_balance'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_status_check') then
    alter table public.transactions add constraint transactions_status_check
      check (status in ('confirmed','voided'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_direction_check') then
    alter table public.transactions add constraint transactions_direction_check
      check (direction is null or direction in ('increase','decrease'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_currency_check') then
    alter table public.transactions add constraint transactions_currency_check
      check (char_length(currency_code) = 3);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'transactions_distinct_accounts_check') then
    alter table public.transactions add constraint transactions_distinct_accounts_check
      check (source_account_id is null
             or destination_account_id is null
             or source_account_id <> destination_account_id);
  end if;

  -- §34a encoded in the database, so a service bug cannot write an
  -- unbalanceable row. These are the shapes lib/finance/balance.ts assumes.
  if not exists (select 1 from pg_constraint where conname = 'transactions_shape_check') then
    alter table public.transactions add constraint transactions_shape_check check (
      case type
        when 'income'          then destination_account_id is not null and source_account_id is null
        when 'refund'          then destination_account_id is not null and source_account_id is null
        when 'opening_balance' then destination_account_id is not null and source_account_id is null
        when 'expense'         then source_account_id is not null and destination_account_id is null
        when 'adjustment'      then source_account_id is not null and destination_account_id is null
                                    and direction is not null
        when 'transfer'        then source_account_id is not null and destination_account_id is not null
        else false
      end
    );
  end if;
end $$;

create index if not exists transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc);
create index if not exists transactions_user_type_idx
  on public.transactions (user_id, type);
create index if not exists transactions_user_category_idx
  on public.transactions (user_id, category_id);
create index if not exists transactions_source_idx
  on public.transactions (source_account_id) where source_account_id is not null;
create index if not exists transactions_destination_idx
  on public.transactions (destination_account_id) where destination_account_id is not null;
-- Partial: analytics and balances read confirmed rows almost exclusively.
create index if not exists transactions_confirmed_idx
  on public.transactions (user_id, transaction_date desc) where status = 'confirmed';

drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- tags
-- -----------------------------------------------------------------------------

create table if not exists public.tags (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists tags_user_name_idx on public.tags (user_id, lower(name));

create table if not exists public.transaction_tags (
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  tag_id         uuid not null references public.tags (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  primary key (transaction_id, tag_id)
);

create index if not exists transaction_tags_tag_idx on public.transaction_tags (tag_id);

-- -----------------------------------------------------------------------------
-- Balance derivation
--
-- The SQL mirror of lib/finance/balance.ts §34. Both must agree; the tests in
-- lib/finance/balance.test.ts define the contract.
-- -----------------------------------------------------------------------------

create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
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

  update public.accounts set current_balance = v_balance where id = p_account_id;
  return v_balance;
end;
$$;

comment on function public.recalculate_account_balance(uuid) is
  'Derives the authoritative balance from confirmed transactions only. accounts.opening_balance is deliberately excluded.';

-- -----------------------------------------------------------------------------
-- Seed system categories (§13, §14)
-- -----------------------------------------------------------------------------

insert into public.categories (user_id, name, type, is_system)
select null, name, 'expense', true
from (values
  ('Food'),('Transportation'),('Housing'),('Utilities'),('Loans'),('Education'),
  ('Health'),('Shopping'),('Entertainment'),('Subscriptions'),('Fitness'),
  ('Car'),('Business'),('Technology'),('Travel'),('Other')
) as t(name)
on conflict do nothing;

insert into public.categories (user_id, name, type, is_system)
select null, name, 'income', true
from (values
  ('Salary'),('Freelance'),('Business Income'),('Allowance'),
  ('Refund'),('Interest'),('Investment Income'),('Other Income')
) as t(name)
on conflict do nothing;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.accounts         enable row level security;
alter table public.accounts         force  row level security;
alter table public.categories       enable row level security;
alter table public.categories       force  row level security;
alter table public.transactions     enable row level security;
alter table public.transactions     force  row level security;
alter table public.tags             enable row level security;
alter table public.tags             force  row level security;
alter table public.transaction_tags enable row level security;
alter table public.transaction_tags force  row level security;

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
  for select to authenticated using (user_id = (select auth.uid()));

-- System categories are shared; user categories are private.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to authenticated
  using (is_system or user_id = (select auth.uid()));

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists tags_select_own on public.tags;
create policy tags_select_own on public.tags
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists transaction_tags_select_own on public.transaction_tags;
create policy transaction_tags_select_own on public.transaction_tags
  for select to authenticated using (user_id = (select auth.uid()));

-- No INSERT / UPDATE / DELETE policies for `authenticated`, deliberately.

revoke all on public.accounts, public.categories, public.transactions,
              public.tags, public.transaction_tags
  from anon, authenticated;

grant select on public.accounts, public.categories, public.transactions,
                public.tags, public.transaction_tags
  to authenticated;


-- ======================================================================
-- 20260913000300_phase02_transaction_rpc.sql
-- ======================================================================

-- =============================================================================
-- Phase 02 — atomic transaction operations (§37, §64)
--
-- Creating, editing and voiding a transaction each touch a row plus one or two
-- cached balances. Done as separate statements from application code, a crash
-- or a concurrent request between them leaves a balance that disagrees with the
-- ledger — and nothing surfaces it until someone reconciles by hand.
--
-- So each operation is one SQL function: one transaction, all or nothing.
--
-- Ownership is verified INSIDE each function against p_user_id, which callers
-- resolve from the session. These are SECURITY DEFINER, so they bypass RLS —
-- the ownership check here is the only thing standing between a caller and
-- another user's accounts.
-- =============================================================================

-- Shared: assert every referenced account belongs to the user and matches the
-- transaction currency. Raises rather than returning, so a caller cannot
-- accidentally ignore the result.
create or replace function public.assert_account_access(
  p_user_id       uuid,
  p_account_id    uuid,
  p_currency_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_currency text;
  v_archived boolean;
begin
  if p_account_id is null then
    return;
  end if;

  select user_id, currency_code, is_archived
    into v_owner, v_currency, v_archived
  from public.accounts
  where id = p_account_id;

  if v_owner is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> p_user_id then
    -- Same error as not-found on purpose: a distinguishable "forbidden"
    -- confirms the account exists, which is an enumeration oracle.
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_archived then
    raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_currency <> p_currency_code then
    -- HelloPera never converts (master plan §11).
    raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_transaction
-- -----------------------------------------------------------------------------

create or replace function public.create_transaction(
  p_user_id              uuid,
  p_type                 text,
  p_amount               numeric,
  p_currency_code        text,
  p_transaction_date     date,
  p_source_account_id    uuid   default null,
  p_destination_account_id uuid default null,
  p_category_id          uuid   default null,
  p_direction            text   default null,
  p_merchant_name        text   default null,
  p_description          text   default null,
  p_notes                text   default null,
  p_refund_of            uuid   default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_NOT_POSITIVE' using errcode = 'P0001';
  end if;

  perform public.assert_account_access(p_user_id, p_source_account_id, p_currency_code);
  perform public.assert_account_access(p_user_id, p_destination_account_id, p_currency_code);

  if p_category_id is not null then
    if not exists (
      select 1 from public.categories
      where id = p_category_id and (is_system or user_id = p_user_id)
    ) then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- Lock the affected accounts in a stable order (by id) so two concurrent
  -- writes touching the same pair cannot deadlock by grabbing them opposite
  -- ways round.
  perform 1 from public.accounts
  where id in (p_source_account_id, p_destination_account_id)
  order by id
  for update;

  insert into public.transactions (
    user_id, type, direction, amount, currency_code, transaction_date,
    source_account_id, destination_account_id, category_id,
    merchant_name, description, notes, refund_of_transaction_id, status
  ) values (
    p_user_id, p_type, p_direction, p_amount, p_currency_code, p_transaction_date,
    p_source_account_id, p_destination_account_id, p_category_id,
    nullif(btrim(coalesce(p_merchant_name, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_refund_of, 'confirmed'
  )
  returning id into v_id;

  -- Recompute from the ledger rather than incrementing the cache: an
  -- increment that runs twice is undetectable, a recompute is idempotent.
  if p_source_account_id is not null then
    perform public.recalculate_account_balance(p_source_account_id);
  end if;
  if p_destination_account_id is not null then
    perform public.recalculate_account_balance(p_destination_account_id);
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'transaction', v_id, 'transaction_created',
     jsonb_build_object('type', p_type, 'amount', p_amount, 'currency', p_currency_code));

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- void_transaction
--
-- Voiding, never deleting (§32). The row stays visible in history and audit;
-- it simply stops affecting balances.
-- -----------------------------------------------------------------------------

create or replace function public.void_transaction(
  p_user_id uuid,
  p_id      uuid,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx public.transactions%rowtype;
begin
  select * into v_tx from public.transactions
  where id = p_id and user_id = p_user_id
  for update;

  if v_tx.id is null then
    raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tx.status = 'voided' then
    -- Idempotent: a double submit must not produce a second audit entry.
    return;
  end if;

  update public.transactions
  set status = 'voided',
      void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_id;

  if v_tx.source_account_id is not null then
    perform public.recalculate_account_balance(v_tx.source_account_id);
  end if;
  if v_tx.destination_account_id is not null then
    perform public.recalculate_account_balance(v_tx.destination_account_id);
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data, metadata)
  values
    (p_user_id, p_user_id, 'transaction', p_id, 'transaction_voided',
     jsonb_build_object('status', 'confirmed', 'amount', v_tx.amount),
     jsonb_build_object('status', 'voided'),
     jsonb_build_object('reason', coalesce(p_reason, '')));
end;
$$;

-- -----------------------------------------------------------------------------
-- create_account
--
-- The account and its opening_balance transaction are created together.
-- Separately, a crash between them leaves an account whose stated opening
-- balance has no ledger entry behind it.
-- -----------------------------------------------------------------------------

create or replace function public.create_account(
  p_user_id          uuid,
  p_name             text,
  p_type             text,
  p_nature           text,
  p_currency_code    text,
  p_opening_balance  numeric default 0,
  p_institution_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.accounts
    (user_id, name, type, nature, currency_code, opening_balance, institution_name)
  values
    (p_user_id, btrim(p_name), p_type, p_nature, upper(p_currency_code),
     coalesce(p_opening_balance, 0),
     nullif(btrim(coalesce(p_institution_name, '')), ''))
  returning id into v_id;

  -- Only when non-zero: an opening_balance row of 0 is noise in the ledger.
  if coalesce(p_opening_balance, 0) <> 0 then
    insert into public.transactions
      (user_id, type, direction, amount, currency_code, transaction_date,
       destination_account_id, status, description)
    values
      (p_user_id, 'opening_balance',
       case when p_opening_balance < 0 then 'decrease' else 'increase' end,
       abs(p_opening_balance), upper(p_currency_code), current_date,
       v_id, 'confirmed', 'Opening balance');
  end if;

  perform public.recalculate_account_balance(v_id);

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'account', v_id, 'account_created',
     jsonb_build_object('name', p_name, 'type', p_type, 'nature', p_nature));

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Integrity check (§36, and Phase 14 §64)
-- -----------------------------------------------------------------------------

create or replace function public.check_balance_integrity(p_user_id uuid)
returns table (account_id uuid, account_name text, cached numeric, derived numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select a.id, a.name, a.current_balance,
         public.recalculate_account_balance(a.id)
  from public.accounts a
  where a.user_id = p_user_id;
end;
$$;

comment on function public.check_balance_integrity(uuid) is
  'Reports cached vs derived balance per account. Recalculating repairs as it reads, so run it to both detect and fix drift.';

-- Callable by the service role only. These bypass RLS by design.
revoke all on function public.create_transaction from anon, authenticated;
revoke all on function public.void_transaction   from anon, authenticated;
revoke all on function public.create_account     from anon, authenticated;
revoke all on function public.assert_account_access from anon, authenticated;
revoke all on function public.recalculate_account_balance from anon, authenticated;
revoke all on function public.check_balance_integrity from anon, authenticated;

