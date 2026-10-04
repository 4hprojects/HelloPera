-- Loan details captured when a loan account is created.
--
-- Kept in a side table rather than as nullable columns on `accounts`, so the
-- accounts table, its constraints and `accounts_exact` stay untouched. Interest
-- fields are informational: no amortization or principal/interest split.

create table if not exists public.loan_details (
  account_id        uuid primary key references public.accounts (id) on delete cascade,
  user_id           uuid not null references auth.users (id) on delete cascade,
  principal         numeric(18, 2),
  start_date        date,
  interest_rate_apr numeric(5, 2),
  term_months       integer,
  payment_amount    numeric(18, 2) not null,
  payment_frequency text not null,
  next_due_date     date not null,
  recurring_rule_id uuid references public.recurring_rules (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'loan_details_frequency_check') then
    alter table public.loan_details add constraint loan_details_frequency_check
      check (payment_frequency in ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loan_details_payment_check') then
    alter table public.loan_details add constraint loan_details_payment_check
      check (payment_amount > 0 and (principal is null or principal > 0));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loan_details_rate_check') then
    alter table public.loan_details add constraint loan_details_rate_check
      check (interest_rate_apr is null or interest_rate_apr between 0 and 100);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'loan_details_term_check') then
    alter table public.loan_details add constraint loan_details_term_check
      check (term_months is null or term_months between 1 and 600);
  end if;
end $$;

-- The idempotency ledger only accepts known operations.
alter table public.financial_write_requests
  drop constraint if exists financial_write_requests_operation_check;
alter table public.financial_write_requests
  add constraint financial_write_requests_operation_check
  check (operation in ('create_account','create_transaction','create_loan_account'));

create index if not exists loan_details_user_idx on public.loan_details (user_id);

drop trigger if exists loan_details_set_updated_at on public.loan_details;
create trigger loan_details_set_updated_at before update on public.loan_details
  for each row execute function public.set_updated_at();

alter table public.loan_details enable row level security;
alter table public.loan_details force row level security;

drop policy if exists loan_details_select_own on public.loan_details;
create policy loan_details_select_own on public.loan_details
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.loan_details from public, anon, authenticated;
grant select on public.loan_details to authenticated;
grant all on public.loan_details to service_role;

create or replace view public.loan_details_exact with (security_invoker=true) as
select account_id,principal::text principal,start_date,
       interest_rate_apr::text interest_rate_apr,term_months,
       payment_amount::text payment_amount,payment_frequency,next_due_date,
       recurring_rule_id,created_at,updated_at
from public.loan_details;

revoke all on public.loan_details_exact from public, anon, authenticated;
grant select on public.loan_details_exact to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Atomic, idempotent loan creation: account + opening entry + details + the
-- recurring bill rule, in one transaction.
-- -----------------------------------------------------------------------------

create or replace function public.create_loan_account_idempotent(
  p_user_id uuid, p_request_id uuid, p_name text, p_currency_code text,
  p_opening_balance numeric, p_lender text,
  p_payment_amount numeric, p_payment_frequency text, p_next_due_date date,
  p_principal numeric default null, p_start_date date default null,
  p_interest_rate_apr numeric default null, p_term_months integer default null,
  p_create_reminder boolean default true
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb;
  v_existing public.financial_write_requests%rowtype;
  v_result uuid;
  v_claimed boolean;
  v_rule uuid;
  v_lender text := nullif(btrim(coalesce(p_lender,'')),'');
begin
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  if v_lender is null then raise exception 'LOAN_LENDER_REQUIRED'; end if;
  if coalesce(p_opening_balance,0) <= 0 then raise exception 'LOAN_BALANCE_REQUIRED'; end if;
  if p_principal is not null and p_principal < p_opening_balance then
    raise exception 'LOAN_PRINCIPAL_BELOW_BALANCE';
  end if;

  v_payload := jsonb_build_object(
    'name',btrim(p_name),'currency',upper(p_currency_code),
    'opening_balance',coalesce(p_opening_balance,0)::numeric(18,2)::text,
    'lender',v_lender,
    'payment_amount',p_payment_amount::numeric(18,2)::text,
    'frequency',p_payment_frequency,'next_due_date',p_next_due_date,
    'principal',p_principal::numeric(18,2)::text,'start_date',p_start_date,
    'apr',p_interest_rate_apr::numeric(5,2)::text,'term_months',p_term_months,
    'reminder',coalesce(p_create_reminder,true)
  );

  insert into public.financial_write_requests(user_id,request_id,operation,payload)
  values(p_user_id,p_request_id,'create_loan_account',v_payload)
  on conflict do nothing returning true into v_claimed;

  if not coalesce(v_claimed,false) then
    select * into v_existing from public.financial_write_requests
    where user_id=p_user_id and request_id=p_request_id for update;
    if v_existing.operation <> 'create_loan_account' or v_existing.payload <> v_payload then
      raise exception 'REQUEST_ALREADY_USED' using errcode='P0001';
    end if;
    if v_existing.result_id is null then raise exception 'REQUEST_INCOMPLETE'; end if;
    return v_existing.result_id;
  end if;

  v_result := public.create_account(
    p_user_id,p_name,'loan','liability',p_currency_code,p_opening_balance,v_lender
  );

  if coalesce(p_create_reminder,true) then
    insert into public.recurring_rules
      (user_id,rule_type,name,amount,currency_code,frequency,interval_count,
       start_date,next_occurrence_date,account_id,provider_name)
    values
      (p_user_id,'bill',btrim(p_name)||' payment',p_payment_amount,upper(p_currency_code),
       p_payment_frequency,1,p_next_due_date,p_next_due_date,v_result,v_lender)
    returning id into v_rule;
  end if;

  insert into public.loan_details
    (account_id,user_id,principal,start_date,interest_rate_apr,term_months,
     payment_amount,payment_frequency,next_due_date,recurring_rule_id)
  values
    (v_result,p_user_id,p_principal,p_start_date,p_interest_rate_apr,p_term_months,
     p_payment_amount,p_payment_frequency,p_next_due_date,v_rule);

  update public.financial_write_requests set result_id=v_result
  where user_id=p_user_id and request_id=p_request_id;
  return v_result;
end $$;

revoke all on function public.create_loan_account_idempotent(uuid,uuid,text,text,numeric,text,numeric,text,date,numeric,date,numeric,integer,boolean) from public,anon,authenticated;
grant execute on function public.create_loan_account_idempotent(uuid,uuid,text,text,numeric,text,numeric,text,date,numeric,date,numeric,integer,boolean) to service_role;
