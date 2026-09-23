-- Launch integrity: retry-safe payments and validated recurring settlement.
create table if not exists public.payment_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  transaction_id uuid not null references public.transactions(id),
  allocation_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (user_id, request_id)
);
alter table public.payment_requests enable row level security;
revoke all on public.payment_requests from public, anon, authenticated;
grant all on public.payment_requests to service_role;

create or replace function public.record_obligation_payment(
  p_user_id uuid, p_request_id uuid, p_kind text, p_obligation_id uuid,
  p_amount numeric, p_account_id uuid default null,
  p_date date default null, p_transaction_id uuid default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb; v_previous public.payment_requests%rowtype;
  v_currency text; v_tx uuid; v_allocation uuid; v_type text;
begin
  if p_request_id is null or p_kind is null or p_kind not in ('bill','receivable','expected_income') then
    raise exception 'INVALID_PAYMENT_REQUEST';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount,2) then raise exception 'AMOUNT_NOT_POSITIVE'; end if;
  -- One user's payment retries serialize, including concurrent identical requests.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 731));
  if not exists(select 1 from public.profiles where id=p_user_id and status='active') then
    raise exception 'USER_UNAVAILABLE';
  end if;
  v_payload := jsonb_build_object('kind',p_kind,'obligation',p_obligation_id,
    'amount',p_amount,'account',p_account_id,'date',p_date,'transaction',p_transaction_id);
  select * into v_previous from public.payment_requests
    where user_id=p_user_id and request_id=p_request_id;
  if found then
    if v_previous.payload <> v_payload then raise exception 'REQUEST_ALREADY_USED'; end if;
    return jsonb_build_object('transaction_id',v_previous.transaction_id,'allocation_id',v_previous.allocation_id);
  end if;
  -- Existing transaction first: same lock order as void_transaction.
  if p_transaction_id is not null then
    select id, type into v_tx,v_type from public.transactions
      where id=p_transaction_id and user_id=p_user_id and status='confirmed' for update;
    if v_tx is null then raise exception 'TRANSACTION_NOT_CONFIRMED'; end if;
    if v_type <> (case when p_kind='bill' then 'expense' else 'income' end) then
      raise exception 'TRANSACTION_DIRECTION_MISMATCH';
    end if;
  end if;
  if p_kind='bill' then
    select currency_code into v_currency from public.bills where id=p_obligation_id and user_id=p_user_id for update;
  elsif p_kind='receivable' then
    select currency_code into v_currency from public.receivables where id=p_obligation_id and user_id=p_user_id for update;
  else
    select currency_code into v_currency from public.expected_income where id=p_obligation_id and user_id=p_user_id for update;
  end if;
  if v_currency is null then raise exception 'OBLIGATION_NOT_FOUND'; end if;
  if p_transaction_id is null then
    if p_account_id is null or p_date is null then raise exception 'INVALID_PAYMENT_REQUEST'; end if;
    v_tx := public.create_transaction(p_user_id,
      case when p_kind='bill' then 'expense' else 'income' end,
      p_amount,v_currency,p_date,
      case when p_kind='bill' then p_account_id else null end,
      case when p_kind<>'bill' then p_account_id else null end);
  end if;
  v_allocation := public.allocate_payment(p_user_id,p_kind,p_obligation_id,v_tx,p_amount);
  insert into public.payment_requests(user_id,request_id,payload,transaction_id,allocation_id)
    values(p_user_id,p_request_id,v_payload,v_tx,v_allocation);
  return jsonb_build_object('transaction_id',v_tx,'allocation_id',v_allocation);
end $$;
revoke all on function public.record_obligation_payment(uuid,uuid,text,uuid,numeric,uuid,date,uuid) from public, anon, authenticated;
grant execute on function public.record_obligation_payment(uuid,uuid,text,uuid,numeric,uuid,date,uuid) to service_role;

create or replace function public.fulfill_expected_event(p_user_id uuid,p_event_id uuid,p_transaction_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_tx public.transactions%rowtype; v_event public.expected_events%rowtype;
begin
  select * into v_tx from public.transactions where id=p_transaction_id and user_id=p_user_id for update;
  select * into v_event from public.expected_events where id=p_event_id and user_id=p_user_id for update;
  if v_tx.id is null or v_event.id is null then raise exception 'RECORD_NOT_FOUND'; end if;
  if v_tx.status <> 'confirmed' then raise exception 'TRANSACTION_NOT_CONFIRMED'; end if;
  if v_tx.currency_code <> v_event.currency_code then raise exception 'CURRENCY_MISMATCH'; end if;
  if v_tx.type <> (case when v_event.event_type in ('income','expected_income') then 'income' else 'expense' end) then
    raise exception 'TRANSACTION_DIRECTION_MISMATCH';
  end if;
  if v_event.status='fulfilled' and v_event.actual_transaction_id=p_transaction_id then return; end if;
  if v_event.status<>'scheduled' then raise exception 'EVENT_NOT_SCHEDULED'; end if;
  update public.expected_events set status='fulfilled',actual_transaction_id=p_transaction_id where id=p_event_id;
end $$;
revoke all on function public.fulfill_expected_event(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fulfill_expected_event(uuid,uuid,uuid) to service_role;

create or replace function public.reopen_voided_expectations() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.status='voided' and old.status<>'voided' then
    update public.expected_events set status='scheduled',actual_transaction_id=null
      where actual_transaction_id=new.id and user_id=new.user_id;
  end if;
  return new;
end $$;
revoke all on function public.reopen_voided_expectations() from public,anon,authenticated;
drop trigger if exists reopen_voided_expectations on public.transactions;
create trigger reopen_voided_expectations after update of status on public.transactions
  for each row execute function public.reopen_voided_expectations();
