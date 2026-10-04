-- Date borrowed (lent) on receivables: when the money actually went out.
-- Optional and informational; the due date remains the expected repayment.

alter table public.receivables add column if not exists borrowed_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'receivables_borrowed_before_due_check') then
    alter table public.receivables add constraint receivables_borrowed_before_due_check
      check (borrowed_date is null or due_date is null or due_date >= borrowed_date);
  end if;
end $$;

drop function if exists public.update_obligation(
  uuid, text, uuid, text, numeric, date, text, text, uuid, numeric, integer, integer);

create or replace function public.update_obligation(
  p_user_id     uuid,
  p_kind        text,
  p_id          uuid,
  p_name        text,
  p_amount      numeric,
  p_date        date,
  p_description text default null,
  p_notes       text default null,
  p_category_id uuid default null,
  p_installment_amount numeric default null,
  p_installment_count  integer default null,
  p_installments_prior integer default 0,
  p_borrowed_date      date default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_name    text := nullif(btrim(coalesce(p_name, '')), '');
  v_desc    text := nullif(btrim(coalesce(p_description, '')), '');
  v_notes   text := nullif(btrim(coalesce(p_notes, '')), '');
  v_status  text;
  v_old     numeric(18,2);
  v_applied numeric(18,2);
  v_new     text;
begin
  if p_kind not in ('bill', 'receivable', 'expected_income') then
    raise exception 'UNKNOWN_OBLIGATION_TYPE' using errcode = 'P0001';
  end if;
  if v_name is null then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_NOT_POSITIVE' using errcode = 'P0001';
  end if;
  if p_kind = 'receivable' and p_borrowed_date is not null
     and p_date is not null and p_date < p_borrowed_date then
    raise exception 'DATE_BEFORE_BORROWED' using errcode = 'P0001';
  end if;
  if p_kind <> 'receivable' and p_date is null then
    raise exception 'DATE_REQUIRED' using errcode = 'P0001';
  end if;
  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.is_active
      and (c.is_system or c.user_id = p_user_id)
  ) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_kind = 'bill' then
    if (p_installment_amount is not null or p_installment_count is not null)
       and (p_installment_amount is null or p_installment_count is null
            or p_installment_amount <= 0 or p_installment_amount > p_amount
            or p_installment_count not between 2 and 600
            or coalesce(p_installments_prior, 0) not between 0 and p_installment_count) then
      raise exception 'INSTALLMENT_INVALID' using errcode = 'P0001';
    end if;
    if p_installment_amount is null and coalesce(p_installments_prior, 0) <> 0 then
      raise exception 'INSTALLMENT_INVALID' using errcode = 'P0001';
    end if;
    select status, amount into v_status, v_old from public.bills
      where id = p_id and user_id = p_user_id for update;
    if v_status is null then raise exception 'OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_status = 'cancelled' then raise exception 'OBLIGATION_CANCELLED' using errcode = 'P0001'; end if;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.bill_payments where bill_id = p_id;
    if p_amount < v_applied then raise exception 'AMOUNT_BELOW_APPLIED' using errcode = 'P0001'; end if;
    v_new := case when v_applied >= p_amount then 'paid'
                  when v_applied > 0 then 'partially_paid' else 'open' end;
    update public.bills
      set provider_name = v_name, description = v_desc, amount = p_amount,
          due_date = p_date, category_id = p_category_id, notes = v_notes,
          installment_amount = p_installment_amount,
          installment_count = p_installment_count,
          installments_prior = coalesce(p_installments_prior, 0), status = v_new
      where id = p_id;

  elsif p_kind = 'receivable' then
    select status, amount into v_status, v_old from public.receivables
      where id = p_id and user_id = p_user_id for update;
    if v_status is null then raise exception 'OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_status = 'cancelled' then raise exception 'OBLIGATION_CANCELLED' using errcode = 'P0001'; end if;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.receivable_payments where receivable_id = p_id;
    if p_amount < v_applied then raise exception 'AMOUNT_BELOW_APPLIED' using errcode = 'P0001'; end if;
    v_new := case when v_applied >= p_amount then 'paid'
                  when v_applied > 0 then 'partially_paid' else 'open' end;
    update public.receivables
      set party_name = v_name, description = v_desc, amount = p_amount,
          due_date = p_date, borrowed_date = p_borrowed_date, notes = v_notes,
          status = v_new
      where id = p_id;

  else
    select status, amount into v_status, v_old from public.expected_income
      where id = p_id and user_id = p_user_id for update;
    if v_status is null then raise exception 'OBLIGATION_NOT_FOUND' using errcode = 'P0002'; end if;
    if v_status = 'cancelled' then raise exception 'OBLIGATION_CANCELLED' using errcode = 'P0001'; end if;
    select coalesce(sum(amount_applied), 0) into v_applied
      from public.expected_income_receipts where expected_income_id = p_id;
    if p_amount < v_applied then raise exception 'AMOUNT_BELOW_APPLIED' using errcode = 'P0001'; end if;
    v_new := case when v_applied >= p_amount then 'paid'
                  when v_applied > 0 then 'partially_paid' else 'open' end;
    update public.expected_income
      set source_name = v_name, description = v_desc, amount = p_amount,
          expected_date = p_date, category_id = p_category_id, notes = v_notes,
          status = v_new
      where id = p_id;
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data)
  values
    (p_user_id, p_user_id, p_kind, p_id, 'obligation_updated',
     jsonb_build_object('amount', v_old, 'status', v_status),
     jsonb_build_object('amount', p_amount, 'status', v_new, 'date', p_date));
end;
$$;

revoke all on function public.update_obligation from public, anon, authenticated;
grant execute on function public.update_obligation to service_role;
