-- Phase 1 correctness: exact reads, replay-safe creation, analytics snapshots,
-- and a fail-closed database boundary for scheduled financial generation.

create table if not exists public.financial_write_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  operation text not null check (operation in ('create_account','create_transaction')),
  payload jsonb not null,
  result_id uuid,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);

alter table public.financial_write_requests enable row level security;
alter table public.financial_write_requests force row level security;
revoke all on public.financial_write_requests from public, anon, authenticated;
grant select, insert, update on public.financial_write_requests to service_role;

create or replace function public.create_transaction_idempotent(
  p_user_id uuid, p_request_id uuid, p_type text, p_amount numeric,
  p_currency_code text, p_transaction_date date,
  p_source_account_id uuid default null, p_destination_account_id uuid default null,
  p_category_id uuid default null, p_direction text default null,
  p_merchant_name text default null, p_description text default null,
  p_notes text default null, p_refund_of uuid default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb;
  v_existing public.financial_write_requests%rowtype;
  v_result uuid;
  v_claimed boolean;
begin
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  v_payload := jsonb_build_object(
    'type',p_type,'amount',p_amount::numeric(18,2)::text,
    'currency',upper(p_currency_code),'date',p_transaction_date::text,
    'source',p_source_account_id,'destination',p_destination_account_id,
    'category',p_category_id,'direction',p_direction,
    'merchant',nullif(btrim(coalesce(p_merchant_name,'')),''),
    'description',nullif(btrim(coalesce(p_description,'')),''),
    'notes',nullif(btrim(coalesce(p_notes,'')),''),'refund_of',p_refund_of
  );

  insert into public.financial_write_requests(user_id,request_id,operation,payload)
  values(p_user_id,p_request_id,'create_transaction',v_payload)
  on conflict do nothing returning true into v_claimed;

  if not coalesce(v_claimed,false) then
    select * into v_existing from public.financial_write_requests
    where user_id=p_user_id and request_id=p_request_id for update;
    if v_existing.operation <> 'create_transaction' or v_existing.payload <> v_payload then
      raise exception 'REQUEST_ALREADY_USED' using errcode='P0001';
    end if;
    if v_existing.result_id is null then raise exception 'REQUEST_INCOMPLETE'; end if;
    return v_existing.result_id;
  end if;

  v_result := public.create_transaction(
    p_user_id,p_type,p_amount,p_currency_code,p_transaction_date,
    p_source_account_id,p_destination_account_id,p_category_id,p_direction,
    p_merchant_name,p_description,p_notes,p_refund_of
  );
  update public.financial_write_requests set result_id=v_result
  where user_id=p_user_id and request_id=p_request_id;
  return v_result;
end $$;

create or replace function public.create_account_idempotent(
  p_user_id uuid, p_request_id uuid, p_name text, p_type text, p_nature text,
  p_currency_code text, p_opening_balance numeric default 0,
  p_institution_name text default null
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  v_payload jsonb;
  v_existing public.financial_write_requests%rowtype;
  v_result uuid;
  v_claimed boolean;
begin
  if p_request_id is null then raise exception 'REQUEST_ID_REQUIRED'; end if;
  v_payload := jsonb_build_object(
    'name',btrim(p_name),'type',p_type,'nature',p_nature,
    'currency',upper(p_currency_code),
    'opening_balance',coalesce(p_opening_balance,0)::numeric(18,2)::text,
    'institution',nullif(btrim(coalesce(p_institution_name,'')),'')
  );

  insert into public.financial_write_requests(user_id,request_id,operation,payload)
  values(p_user_id,p_request_id,'create_account',v_payload)
  on conflict do nothing returning true into v_claimed;

  if not coalesce(v_claimed,false) then
    select * into v_existing from public.financial_write_requests
    where user_id=p_user_id and request_id=p_request_id for update;
    if v_existing.operation <> 'create_account' or v_existing.payload <> v_payload then
      raise exception 'REQUEST_ALREADY_USED' using errcode='P0001';
    end if;
    if v_existing.result_id is null then raise exception 'REQUEST_INCOMPLETE'; end if;
    return v_existing.result_id;
  end if;

  v_result := public.create_account(
    p_user_id,p_name,p_type,p_nature,p_currency_code,p_opening_balance,p_institution_name
  );
  update public.financial_write_requests set result_id=v_result
  where user_id=p_user_id and request_id=p_request_id;
  return v_result;
end $$;

revoke all on function public.create_transaction_idempotent(uuid,uuid,text,numeric,text,date,uuid,uuid,uuid,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.create_account_idempotent(uuid,uuid,text,text,text,text,numeric,text) from public,anon,authenticated;
grant execute on function public.create_transaction_idempotent(uuid,uuid,text,numeric,text,date,uuid,uuid,uuid,text,text,text,text,uuid) to service_role;
grant execute on function public.create_account_idempotent(uuid,uuid,text,text,text,text,numeric,text) to service_role;

create or replace view public.accounts_exact with (security_invoker=true) as
select id,name,type,nature,currency_code,opening_balance::text opening_balance,
       current_balance::text current_balance,institution_name,is_active,is_archived,
       created_at,updated_at
from public.accounts;

create or replace view public.transactions_exact with (security_invoker=true) as
select id,type,direction,amount::text amount,currency_code,transaction_date,
       source_account_id,destination_account_id,category_id,merchant_name,
       description,notes,refund_of_transaction_id,transfer_group_id,status,
       void_reason,is_archived,created_at,updated_at
from public.transactions;

create or replace view public.recurring_rules_exact with (security_invoker=true) as
select id,rule_type,name,description,amount::text amount,currency_code,frequency,
       interval_count,day_of_month,day_of_week,start_date,end_date,
       next_occurrence_date,account_id,category_id,provider_name,source_name,
       is_active,is_paused,created_at,updated_at
from public.recurring_rules;

create or replace view public.expected_events_exact with (security_invoker=true) as
select id,recurring_rule_id,event_type,name,amount::text amount,currency_code,
       scheduled_date,status,account_id,category_id,actual_transaction_id,
       include_in_forecast,detached_from_rule,source_entity_type,source_entity_id,
       created_at,updated_at
from public.expected_events;

create or replace view public.billing_history_exact with (security_invoker=true) as
select id,provider,amount::text amount,currency_code,status,billing_period_start,
       billing_period_end,receipt_url,created_at
from public.billing_history;

create or replace view public.plans_exact with (security_invoker=true) as
select id,code,name,description,is_active,is_public,billing_interval,
       price_amount::text price_amount,currency_code,created_at,updated_at
from public.plans;

revoke all on public.accounts_exact,public.transactions_exact,
  public.recurring_rules_exact,public.expected_events_exact,
  public.billing_history_exact,public.plans_exact from public,anon;
grant select on public.accounts_exact,public.transactions_exact,
  public.recurring_rules_exact,public.expected_events_exact,
  public.billing_history_exact,public.plans_exact to authenticated,service_role;

create or replace function public.read_analytics_snapshot(
  p_from date, p_to date, p_max_rows integer default 60000
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_result jsonb; v_count integer;
begin
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'INVALID_ANALYTICS_RANGE';
  end if;
  if p_max_rows < 1 or p_max_rows > 60000 then
    raise exception 'INVALID_ANALYTICS_LIMIT';
  end if;

  -- One statement, one MVCC snapshot: the row-count guard and the payload can
  -- never disagree, even while financial writes commit concurrently.
  with rows_in_window as (
    select t.*, count(*) over () as total
    from public.transactions t
    where t.status='confirmed' and t.transaction_date between p_from and p_to
  )
  select coalesce(max(t.total),0)::integer,
    case when coalesce(max(t.total),0) > p_max_rows then '[]'::jsonb else
    coalesce(jsonb_agg(jsonb_build_object(
    'id',t.id,'type',t.type,'status',t.status,'direction',t.direction,
    'amount',t.amount::text,'currency_code',t.currency_code,
    'transaction_date',t.transaction_date,'category_id',t.category_id,
    'source_account_id',t.source_account_id,
    'destination_account_id',t.destination_account_id,
    'merchant_name',t.merchant_name,
    'refund_of_transaction_id',t.refund_of_transaction_id,
    'parent',case when p.id is null then null else jsonb_build_object(
      'category_id',p.category_id,'source_account_id',p.source_account_id,
      'merchant_name',p.merchant_name,'currency_code',p.currency_code) end
  ) order by t.transaction_date,t.id),'[]'::jsonb) end
  into v_count, v_result
  from rows_in_window t
  left join public.transactions p on p.id=t.refund_of_transaction_id;
  if v_count > p_max_rows then raise exception 'ANALYTICS_WINDOW_TOO_LARGE'; end if;
  return v_result;
end $$;
revoke all on function public.read_analytics_snapshot(date,date,integer) from public,anon;
grant execute on function public.read_analytics_snapshot(date,date,integer) to authenticated;

create or replace function public.assert_financial_writes_enabled()
returns void language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;
begin
  select enabled into v_enabled from public.feature_flags
  where key='financial_writes_enabled';
  if not found or v_enabled is distinct from true then
    raise exception 'FINANCIAL_WRITES_DISABLED' using errcode='P0001';
  end if;
end $$;
revoke all on function public.assert_financial_writes_enabled() from public,anon,authenticated;
grant execute on function public.assert_financial_writes_enabled() to service_role;

create or replace function public.generate_occurrence(
  p_rule_id uuid, p_occurrence_date date
) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.recurring_rules%rowtype; v_id uuid;
begin
  perform public.assert_financial_writes_enabled();
  select * into r from public.recurring_rules where id=p_rule_id;
  if not found then raise exception 'RULE_NOT_FOUND' using errcode='P0001'; end if;
  if not r.is_active or r.is_paused then return null; end if;
  if p_occurrence_date < r.start_date then return null; end if;
  if r.end_date is not null and p_occurrence_date > r.end_date then return null; end if;

  if r.rule_type='bill' then
    insert into public.bills(user_id,provider_name,description,category_id,amount,
      currency_code,due_date,status,recurring_rule_id,occurrence_date)
    values(r.user_id,coalesce(r.provider_name,r.name),r.description,r.category_id,
      r.amount,r.currency_code,p_occurrence_date,'open',r.id,p_occurrence_date)
    on conflict do nothing returning id into v_id;
  elsif r.rule_type='expected_income' then
    insert into public.expected_income(user_id,source_name,description,category_id,
      amount,currency_code,expected_date,status,recurring_rule_id,occurrence_date)
    values(r.user_id,coalesce(r.source_name,r.name),r.description,r.category_id,
      r.amount,r.currency_code,p_occurrence_date,'open',r.id,p_occurrence_date)
    on conflict do nothing returning id into v_id;
  else
    insert into public.expected_events(user_id,recurring_rule_id,event_type,name,
      amount,currency_code,scheduled_date,status,account_id,category_id)
    values(r.user_id,r.id,r.rule_type,r.name,r.amount,r.currency_code,
      p_occurrence_date,'scheduled',r.account_id,r.category_id)
    on conflict do nothing returning id into v_id;
  end if;
  return v_id;
end $$;
revoke all on function public.generate_occurrence(uuid,date) from public,anon,authenticated;
grant execute on function public.generate_occurrence(uuid,date) to service_role;

-- Keep the established orchestration body and place the operational flag check
-- ahead of its job row, locks, cursor changes, and generated records.
do $$
begin
  if to_regprocedure('public.run_recurring_generation_unchecked(integer,uuid)') is null then
    alter function public.run_recurring_generation(integer,uuid)
      rename to run_recurring_generation_unchecked;
  end if;
end $$;

create or replace function public.run_recurring_generation(
  p_horizon_days integer default 90, p_user_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;
begin
  select enabled into v_enabled from public.feature_flags
  where key='financial_writes_enabled';
  if not found or v_enabled is distinct from true then
    return jsonb_build_object('skipped',true,'reason','financial_writes_disabled');
  end if;
  return public.run_recurring_generation_unchecked(p_horizon_days,p_user_id);
exception when undefined_table then
  raise exception 'FINANCIAL_WRITE_FLAG_UNREADABLE' using errcode='P0001';
end $$;

revoke all on function public.run_recurring_generation_unchecked(integer,uuid) from public,anon,authenticated;
revoke all on function public.run_recurring_generation(integer,uuid) from public,anon,authenticated;
grant execute on function public.run_recurring_generation_unchecked(integer,uuid) to service_role;
grant execute on function public.run_recurring_generation(integer,uuid) to service_role;
