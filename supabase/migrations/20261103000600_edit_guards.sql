-- HP-034: close the gaps in editing entries and accounts.
--
--   * update_transaction moved an archived account's balance when the amount
--     changed. It now refuses, as create_transaction always has.
--   * Its "linked" lock ignored expected_events.actual_transaction_id, so an
--     entry that fulfilled a forecast event could change amount under it.
--   * It accepted a category of the wrong type (an income category on an
--     expense). A changed category must now match income or expense.
--   * update_account_details and upsert_bank_details edited archived
--     accounts. Archiving freezes an account, so both refuse.
--
-- The bodies are otherwise those of 20261004000700, 20261103000200 and
-- 20261004001100.

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
  v_tx       public.transactions%rowtype;
  v_linked   boolean;
  v_cat_type text;
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

  -- A changed category must suit the entry: an income category on an
  -- expense would misfile it in every report. Checked only on a change, so
  -- an older entry with a mismatched category can still be edited otherwise.
  if p_category_id is distinct from v_tx.category_id and p_category_id is not null
     and v_tx.type in ('income', 'expense') then
    select c.type into v_cat_type from public.categories c where c.id = p_category_id;
    if v_cat_type not in (v_tx.type, 'both') then
      raise exception 'CATEGORY_TYPE_MISMATCH' using errcode = 'P0001';
    end if;
  end if;

  if p_amount <> v_tx.amount then
    select exists (select 1 from public.bill_payments where transaction_id = p_id)
        or exists (select 1 from public.receivable_payments where transaction_id = p_id)
        or exists (select 1 from public.expected_income_receipts where transaction_id = p_id)
        or exists (select 1 from public.expected_events where actual_transaction_id = p_id)
      into v_linked;
    if v_linked then
      raise exception 'TRANSACTION_LINKED' using errcode = 'P0001';
    end if;
    -- An archived account's balance is frozen: nothing may move it.
    if exists (
      select 1 from public.accounts a
      where a.id in (v_tx.source_account_id, v_tx.destination_account_id)
        and a.is_archived
    ) then
      raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
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
  v_acc   public.accounts%rowtype;
  v_ld    public.loan_details%rowtype;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_inst  text := nullif(btrim(coalesce(p_institution_name, '')), '');
  v_today date;
begin
  select * into v_acc from public.accounts
  where id = p_id and user_id = p_user_id for update;
  if v_acc.id is null then raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_acc.is_archived then raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001'; end if;
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

    select * into v_ld from public.loan_details where account_id = p_id for update;

    update public.loan_details
      set payment_amount = p_payment_amount, payment_frequency = p_payment_frequency,
          next_due_date = p_next_due_date, principal = p_principal,
          interest_rate_apr = p_interest_rate_apr, term_months = p_term_months
      where account_id = p_id;

    if v_ld.recurring_rule_id is not null then
      select (now() at time zone coalesce(p.timezone, 'Asia/Manila'))::date
        into v_today from public.profiles p where p.id = p_user_id;
      v_today := coalesce(v_today, current_date);

      if v_ld.payment_frequency is distinct from p_payment_frequency
         or v_ld.next_due_date is distinct from p_next_due_date then
        -- A new schedule starts at its next due date. One in the past would
        -- make the generator back-fill overdue bills that were never due.
        if p_next_due_date < v_today then
          raise exception 'LOAN_NEXT_DUE_IN_PAST' using errcode = 'P0001';
        end if;
        delete from public.bills where id in (
          select public.untouched_rule_bills(p_user_id, v_ld.recurring_rule_id, v_today));
        update public.recurring_rules
          set name = v_name || ' payment', amount = p_payment_amount,
              frequency = p_payment_frequency, interval_count = 1,
              day_of_month = null, day_of_week = null,
              start_date = p_next_due_date, next_occurrence_date = p_next_due_date,
              provider_name = v_inst, updated_at = now()
          where id = v_ld.recurring_rule_id and user_id = p_user_id;
      else
        if v_ld.payment_amount is distinct from p_payment_amount then
          update public.bills set amount = p_payment_amount
            where id in (
              select public.untouched_rule_bills(p_user_id, v_ld.recurring_rule_id, v_today));
        end if;
        update public.recurring_rules
          set name = v_name || ' payment', amount = p_payment_amount,
              provider_name = v_inst, updated_at = now()
          where id = v_ld.recurring_rule_id and user_id = p_user_id;
      end if;
    end if;
  end if;

  update public.accounts set name = v_name, institution_name = v_inst where id = p_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data)
  values
    (p_user_id, p_user_id, 'account', p_id, 'account_updated',
     jsonb_build_object('name', v_acc.name, 'institution', v_acc.institution_name,
                        'payment_amount', v_ld.payment_amount::text,
                        'payment_frequency', v_ld.payment_frequency,
                        'next_due_date', v_ld.next_due_date),
     jsonb_build_object('name', v_name, 'institution', v_inst,
                        'payment_amount', p_payment_amount::numeric(18,2)::text,
                        'payment_frequency', p_payment_frequency,
                        'next_due_date', p_next_due_date));
end;
$$;

revoke all on function public.update_account_details from public, anon, authenticated;
grant execute on function public.update_account_details to service_role;

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
  if exists (select 1 from public.accounts where id = p_account_id and is_archived) then
    raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
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
