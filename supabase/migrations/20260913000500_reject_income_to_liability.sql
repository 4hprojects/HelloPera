-- =============================================================================
-- Reject income into a liability account.
--
-- Found by the Phase 02 end-to-end test. The shape CHECK only requires income
-- to have a destination; it cannot verify that account's NATURE, because a
-- CHECK constraint may not run a subquery.
--
-- So income into a credit card was accepted, and then had zero balance effect
-- (lib/finance/balance.ts §34: income only applies to assets). The user records
-- income, no balance moves, and nothing reports an error — the worst shape of
-- bug in a ledger, because it is silent.
--
-- Enforced in the RPC, which is the only write path.
-- =============================================================================

create or replace function public.assert_income_destination(
  p_type       text,
  p_account_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nature text;
begin
  if p_type <> 'income' or p_account_id is null then
    return;
  end if;

  select nature into v_nature from public.accounts where id = p_account_id;

  if v_nature <> 'asset' then
    -- Money arriving on a credit card is a refund (reduces debt) or a
    -- transfer, not income. Both are supported; income is not.
    raise exception 'INCOME_REQUIRES_ASSET' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.assert_income_destination from anon, authenticated;

-- Re-create create_transaction with the extra assertion. Body is otherwise
-- unchanged from 20260913000300.
create or replace function public.create_transaction(
  p_user_id                uuid,
  p_type                   text,
  p_amount                 numeric,
  p_currency_code          text,
  p_transaction_date       date,
  p_source_account_id      uuid default null,
  p_destination_account_id uuid default null,
  p_category_id            uuid default null,
  p_direction              text default null,
  p_merchant_name          text default null,
  p_description            text default null,
  p_notes                  text default null,
  p_refund_of              uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_NOT_POSITIVE' using errcode = 'P0001';
  end if;

  perform public.assert_account_access(p_user_id, p_source_account_id, p_currency_code);
  perform public.assert_account_access(p_user_id, p_destination_account_id, p_currency_code);
  perform public.assert_income_destination(p_type, p_destination_account_id);

  if p_category_id is not null then
    if not exists (
      select 1 from public.categories
      where id = p_category_id and (is_system or user_id = p_user_id)
    ) then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  perform 1 from public.accounts
  where id in (p_source_account_id, p_destination_account_id)
  order by id
  for update;

  insert into public.transactions (
    user_id, type, direction, amount, currency_code, transaction_date,
    source_account_id, destination_account_id, category_id,
    merchant_name, description, notes, refund_of_transaction_id, status
  ) values (
    p_user_id, p_type, p_direction, p_amount, p_currency_code, p_transaction_date,
    p_source_account_id, p_destination_account_id, p_category_id,
    nullif(btrim(coalesce(p_merchant_name, '')), ''),
    nullif(btrim(coalesce(p_description, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''),
    p_refund_of, 'confirmed'
  )
  returning id into v_id;

  if p_source_account_id is not null then
    perform public.recalculate_account_balance(p_source_account_id);
  end if;
  if p_destination_account_id is not null then
    perform public.recalculate_account_balance(p_destination_account_id);
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'transaction', v_id, 'transaction_created',
     jsonb_build_object('type', p_type, 'amount', p_amount, 'currency', p_currency_code));

  return v_id;
end;
$$;

revoke all on function public.create_transaction from anon, authenticated;
