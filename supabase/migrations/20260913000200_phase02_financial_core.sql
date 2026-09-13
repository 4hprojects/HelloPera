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
