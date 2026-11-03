-- HP-038: editing a loan created before loan_details existed lost the edit.
--
-- update_account_details updated the loan's loan_details row, and a loan from
-- before 20261004000600 has none, so the schedule edit changed zero rows and
-- reported success. The first edit now creates the row and the payment rule,
-- as create_loan_account does for a new loan. The body is otherwise that of
-- 20261103000600.

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
  v_rule  uuid;
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

    if v_ld.account_id is null then
      -- A loan created before loan_details existed has no row, so the update
      -- below would change nothing and the edit would vanish. Give it the
      -- details and payment rule a new loan gets (create_loan_account).
      select (now() at time zone coalesce(p.timezone, 'Asia/Manila'))::date
        into v_today from public.profiles p where p.id = p_user_id;
      v_today := coalesce(v_today, current_date);
      if p_next_due_date < v_today then
        raise exception 'LOAN_NEXT_DUE_IN_PAST' using errcode = 'P0001';
      end if;
      insert into public.recurring_rules
        (user_id, rule_type, name, amount, currency_code, frequency, interval_count,
         start_date, next_occurrence_date, account_id, provider_name)
      values
        (p_user_id, 'bill', v_name || ' payment', p_payment_amount, v_acc.currency_code,
         p_payment_frequency, 1, p_next_due_date, p_next_due_date, p_id, v_inst)
      returning id into v_rule;
      insert into public.loan_details
        (account_id, user_id, principal, interest_rate_apr, term_months,
         payment_amount, payment_frequency, next_due_date, recurring_rule_id)
      values
        (p_id, p_user_id, p_principal, p_interest_rate_apr, p_term_months,
         p_payment_amount, p_payment_frequency, p_next_due_date, v_rule);
    end if;

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
