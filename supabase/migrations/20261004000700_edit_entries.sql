-- Editing entries in place.
--
-- Until now everything was create-only: transactions could be voided,
-- obligations cancelled, accounts archived. These RPCs let a person correct
-- the entry itself. All three run as service_role, check ownership in the
-- predicate, and write an audit row with before/after.
--
-- Guard rails, because balances and allocations are derived from these rows:
--   * a transaction's amount is locked once it settles a bill, receivable or
--     expected income (void it to release the link first);
--   * opening-balance and voided transactions cannot be edited;
--   * an obligation's amount cannot drop below what is already applied, and
--     its lifecycle status is recomputed after an amount change;
--   * currency, type and accounts are never editable.

-- -----------------------------------------------------------------------------
-- Transactions
-- -----------------------------------------------------------------------------

create or replace function public.update_transaction(
  p_user_id     uuid,
  p_id          uuid,
  p_amount      numeric,
  p_date        date,
  p_category_id uuid default null,
  p_merchant    text default null,
  p_description text default null,
  p_notes       text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tx     public.transactions%rowtype;
  v_linked boolean;
begin
  select * into v_tx from public.transactions
  where id = p_id and user_id = p_user_id
  for update;

  if v_tx.id is null then
    raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tx.status = 'voided' then
    raise exception 'TRANSACTION_VOIDED' using errcode = 'P0001';
  end if;
  if v_tx.type = 'opening_balance' then
    raise exception 'TRANSACTION_NOT_EDITABLE' using errcode = 'P0001';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_NOT_POSITIVE' using errcode = 'P0001';
  end if;
  if p_date is null then
    raise exception 'DATE_REQUIRED' using errcode = 'P0001';
  end if;

  if p_category_id is not null and not exists (
    select 1 from public.categories c
    where c.id = p_category_id and c.is_active
      and (c.is_system or c.user_id = p_user_id)
  ) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;

  if p_amount <> v_tx.amount then
    select exists (select 1 from public.bill_payments where transaction_id = p_id)
        or exists (select 1 from public.receivable_payments where transaction_id = p_id)
        or exists (select 1 from public.expected_income_receipts where transaction_id = p_id)
      into v_linked;
    if v_linked then
      raise exception 'TRANSACTION_LINKED' using errcode = 'P0001';
    end if;
  end if;

  update public.transactions
  set amount           = p_amount,
      transaction_date = p_date,
      category_id      = p_category_id,
      merchant_name    = nullif(btrim(coalesce(p_merchant, '')), ''),
      description      = nullif(btrim(coalesce(p_description, '')), ''),
      notes            = nullif(btrim(coalesce(p_notes, '')), '')
  where id = p_id;

  if p_amount <> v_tx.amount then
    if v_tx.source_account_id is not null then
      perform public.recalculate_account_balance(v_tx.source_account_id);
    end if;
    if v_tx.destination_account_id is not null then
      perform public.recalculate_account_balance(v_tx.destination_account_id);
    end if;
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data)
  values
    (p_user_id, p_user_id, 'transaction', p_id, 'transaction_updated',
     jsonb_build_object('amount', v_tx.amount, 'date', v_tx.transaction_date,
                        'category_id', v_tx.category_id),
     jsonb_build_object('amount', p_amount, 'date', p_date,
                        'category_id', p_category_id));
end;
$$;

revoke all on function public.update_transaction from public, anon, authenticated;
grant execute on function public.update_transaction to service_role;

-- -----------------------------------------------------------------------------
-- Bills, receivables, expected income
-- -----------------------------------------------------------------------------

create or replace function public.update_obligation(
  p_user_id     uuid,
  p_kind        text,
  p_id          uuid,
  p_name        text,
  p_amount      numeric,
  p_date        date,
  p_description text default null,
  p_notes       text default null,
  p_category_id uuid default null
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
          status = v_new
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
          due_date = p_date, notes = v_notes, status = v_new
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

-- -----------------------------------------------------------------------------
-- Accounts (and loan details)
-- -----------------------------------------------------------------------------

create or replace function public.update_account_details(
  p_user_id           uuid,
  p_id                uuid,
  p_name              text,
  p_institution_name  text default null,
  p_payment_amount    numeric default null,
  p_payment_frequency text default null,
  p_next_due_date     date default null,
  p_principal         numeric default null,
  p_interest_rate_apr numeric default null,
  p_term_months       integer default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_acc  public.accounts%rowtype;
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_inst text := nullif(btrim(coalesce(p_institution_name, '')), '');
  v_rule uuid;
begin
  select * into v_acc from public.accounts
  where id = p_id and user_id = p_user_id for update;
  if v_acc.id is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_name is null then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;

  if v_acc.type = 'loan' then
    if v_inst is null then raise exception 'LOAN_LENDER_REQUIRED' using errcode = 'P0001'; end if;
    if p_payment_amount is null or p_payment_amount <= 0
       or p_payment_frequency is null or p_next_due_date is null then
      raise exception 'LOAN_PAYMENT_REQUIRED' using errcode = 'P0001';
    end if;
    if p_principal is not null and p_principal < v_acc.current_balance then
      raise exception 'LOAN_PRINCIPAL_BELOW_BALANCE' using errcode = 'P0001';
    end if;

    update public.loan_details
      set payment_amount = p_payment_amount, payment_frequency = p_payment_frequency,
          next_due_date = p_next_due_date, principal = p_principal,
          interest_rate_apr = p_interest_rate_apr, term_months = p_term_months
      where account_id = p_id
      returning recurring_rule_id into v_rule;

    -- Keep the reminder in step with the schedule it was created from.
    if v_rule is not null then
      update public.recurring_rules
        set name = v_name || ' payment', amount = p_payment_amount,
            frequency = p_payment_frequency, next_occurrence_date = p_next_due_date,
            provider_name = v_inst
        where id = v_rule and user_id = p_user_id;
    end if;
  end if;

  update public.accounts set name = v_name, institution_name = v_inst where id = p_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data)
  values
    (p_user_id, p_user_id, 'account', p_id, 'account_updated',
     jsonb_build_object('name', v_acc.name, 'institution', v_acc.institution_name),
     jsonb_build_object('name', v_name, 'institution', v_inst));
end;
$$;

revoke all on function public.update_account_details from public, anon, authenticated;
grant execute on function public.update_account_details to service_role;
