-- =============================================================================
-- Voiding a transaction must release its allocations (§57).
--
-- Without this, voiding a ₱1,899 payment leaves the bill still marked paid:
-- the money no longer moved, but the obligation still believes it was settled.
-- The user sees a bill they have not paid, marked paid, with no transaction
-- behind it.
--
-- So void now: releases every link, recomputes each affected obligation's
-- status, then voids — all in one transaction.
-- =============================================================================

create or replace function public.void_transaction(
  p_user_id uuid,
  p_id      uuid,
  p_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tx  public.transactions%rowtype;
  v_rec record;
begin
  select * into v_tx from public.transactions
  where id = p_id and user_id = p_user_id
  for update;

  if v_tx.id is null then
    raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tx.status = 'voided' then
    return;  -- idempotent
  end if;

  -- Release allocations and restate each obligation.
  for v_rec in
    select 'bill' as kind, bill_id as ob_id from public.bill_payments
      where transaction_id = p_id
    union all
    select 'receivable', receivable_id from public.receivable_payments
      where transaction_id = p_id
    union all
    select 'expected_income', expected_income_id from public.expected_income_receipts
      where transaction_id = p_id
  loop
    if v_rec.kind = 'bill' then
      perform 1 from public.bills where id = v_rec.ob_id for update;
      delete from public.bill_payments
        where transaction_id = p_id and bill_id = v_rec.ob_id;
      update public.bills b set status = case
          when coalesce((select sum(amount_applied) from public.bill_payments
                         where bill_id = b.id), 0) >= b.amount then 'paid'
          when coalesce((select sum(amount_applied) from public.bill_payments
                         where bill_id = b.id), 0) > 0 then 'partially_paid'
          else 'open' end
        where b.id = v_rec.ob_id and b.status <> 'cancelled';

    elsif v_rec.kind = 'receivable' then
      perform 1 from public.receivables where id = v_rec.ob_id for update;
      delete from public.receivable_payments
        where transaction_id = p_id and receivable_id = v_rec.ob_id;
      update public.receivables r set status = case
          when coalesce((select sum(amount_applied) from public.receivable_payments
                         where receivable_id = r.id), 0) >= r.amount then 'paid'
          when coalesce((select sum(amount_applied) from public.receivable_payments
                         where receivable_id = r.id), 0) > 0 then 'partially_paid'
          else 'open' end
        where r.id = v_rec.ob_id and r.status <> 'cancelled';

    else
      perform 1 from public.expected_income where id = v_rec.ob_id for update;
      delete from public.expected_income_receipts
        where transaction_id = p_id and expected_income_id = v_rec.ob_id;
      update public.expected_income e set status = case
          when coalesce((select sum(amount_applied) from public.expected_income_receipts
                         where expected_income_id = e.id), 0) >= e.amount then 'paid'
          when coalesce((select sum(amount_applied) from public.expected_income_receipts
                         where expected_income_id = e.id), 0) > 0 then 'partially_paid'
          else 'open' end
        where e.id = v_rec.ob_id and e.status <> 'cancelled';
    end if;

    insert into public.audit_logs
      (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
    values
      (p_user_id, p_user_id, v_rec.kind, v_rec.ob_id, 'payment_unlinked',
       jsonb_build_object('reason', 'transaction_voided', 'transaction_id', p_id));
  end loop;

  update public.transactions
  set status = 'voided',
      void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_id;

  if v_tx.source_account_id is not null then
    perform public.recalculate_account_balance(v_tx.source_account_id);
  end if;
  if v_tx.destination_account_id is not null then
    perform public.recalculate_account_balance(v_tx.destination_account_id);
  end if;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data, metadata)
  values
    (p_user_id, p_user_id, 'transaction', p_id, 'transaction_voided',
     jsonb_build_object('status', 'confirmed', 'amount', v_tx.amount),
     jsonb_build_object('status', 'voided'),
     jsonb_build_object('reason', coalesce(p_reason, '')));
end;
$$;

revoke all on function public.void_transaction from anon, authenticated;
