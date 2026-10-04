-- Deleting an account is only allowed while it has no real history: nothing
-- but its own opening-balance entry. An account with transactions must be
-- archived instead, so balances, reports and payments elsewhere never change
-- because an account disappeared.
--
-- Removes, in one transaction: the account's opening-balance entry (the
-- transactions FK is `on delete restrict`), a loan's reminder rule (and its
-- generated occurrences), then the account. Bank/loan detail rows cascade.

create or replace function public.delete_account(
  p_user_id uuid,
  p_id      uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_acc  public.accounts%rowtype;
  v_rule uuid;
begin
  select * into v_acc from public.accounts
  where id = p_id and user_id = p_user_id for update;
  if v_acc.id is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.transactions t
    where (t.source_account_id = p_id or t.destination_account_id = p_id)
      and t.type <> 'opening_balance'
  ) then
    raise exception 'ACCOUNT_HAS_HISTORY' using errcode = 'P0001';
  end if;

  -- Opening entries can be linked from nothing else, but be explicit.
  if exists (
    select 1 from public.transactions t
    where (t.source_account_id = p_id or t.destination_account_id = p_id)
      and (exists (select 1 from public.bill_payments where transaction_id = t.id)
        or exists (select 1 from public.receivable_payments where transaction_id = t.id)
        or exists (select 1 from public.expected_income_receipts where transaction_id = t.id))
  ) then
    raise exception 'ACCOUNT_HAS_HISTORY' using errcode = 'P0001';
  end if;

  select recurring_rule_id into v_rule from public.loan_details where account_id = p_id;

  delete from public.transactions
    where (source_account_id = p_id or destination_account_id = p_id)
      and type = 'opening_balance';
  if v_rule is not null then
    delete from public.recurring_rules where id = v_rule and user_id = p_user_id;
  end if;
  delete from public.accounts where id = p_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, before_data)
  values
    (p_user_id, p_user_id, 'account', p_id, 'account_deleted',
     jsonb_build_object('name', v_acc.name, 'type', v_acc.type,
                        'opening_balance', v_acc.opening_balance));
end;
$$;

revoke all on function public.delete_account from public, anon, authenticated;
grant execute on function public.delete_account to service_role;
