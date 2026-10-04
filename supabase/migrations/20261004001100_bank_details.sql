-- Bank-only extras: last 4 digits and account kind (savings / checking / time
-- deposit). Informational, so they live in a side table like loan_details and
-- leave `accounts`, its constraints and `accounts_exact` untouched.
-- Only the last 4 digits are ever stored — never a full account number.

create table if not exists public.account_details (
  account_id uuid primary key references public.accounts (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  last4      text,
  kind       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'account_details_last4_check') then
    alter table public.account_details add constraint account_details_last4_check
      check (last4 is null or last4 ~ '^[0-9]{4}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'account_details_kind_check') then
    alter table public.account_details add constraint account_details_kind_check
      check (kind is null or kind in ('savings', 'checking', 'time_deposit'));
  end if;
end $$;

create index if not exists account_details_user_idx on public.account_details (user_id);

drop trigger if exists account_details_set_updated_at on public.account_details;
create trigger account_details_set_updated_at before update on public.account_details
  for each row execute function public.set_updated_at();

alter table public.account_details enable row level security;
alter table public.account_details force row level security;

drop policy if exists account_details_select_own on public.account_details;
create policy account_details_select_own on public.account_details
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.account_details from public, anon, authenticated;
grant select on public.account_details to authenticated;
grant all on public.account_details to service_role;

-- One writer for create and edit. Ownership and type are checked here, so the
-- service layer cannot attach bank details to someone else's or a non-bank account.
create or replace function public.upsert_bank_details(
  p_user_id    uuid,
  p_account_id uuid,
  p_last4      text default null,
  p_kind       text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_last4 text := nullif(btrim(coalesce(p_last4, '')), '');
  v_kind  text := nullif(btrim(coalesce(p_kind, '')), '');
begin
  if not exists (
    select 1 from public.accounts
    where id = p_account_id and user_id = p_user_id and type = 'bank'
  ) then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_last4 is null and v_kind is null then
    delete from public.account_details where account_id = p_account_id;
    return;
  end if;

  insert into public.account_details (account_id, user_id, last4, kind)
  values (p_account_id, p_user_id, v_last4, v_kind)
  on conflict (account_id) do update
    set last4 = excluded.last4, kind = excluded.kind;
end;
$$;

revoke all on function public.upsert_bank_details from public, anon, authenticated;
grant execute on function public.upsert_bank_details to service_role;
