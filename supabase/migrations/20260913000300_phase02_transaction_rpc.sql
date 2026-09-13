-- =============================================================================
-- Phase 02 — atomic transaction operations (§37, §64)
--
-- Creating, editing and voiding a transaction each touch a row plus one or two
-- cached balances. Done as separate statements from application code, a crash
-- or a concurrent request between them leaves a balance that disagrees with the
-- ledger — and nothing surfaces it until someone reconciles by hand.
--
-- So each operation is one SQL function: one transaction, all or nothing.
--
-- Ownership is verified INSIDE each function against p_user_id, which callers
-- resolve from the session. These are SECURITY DEFINER, so they bypass RLS —
-- the ownership check here is the only thing standing between a caller and
-- another user's accounts.
-- =============================================================================

-- Shared: assert every referenced account belongs to the user and matches the
-- transaction currency. Raises rather than returning, so a caller cannot
-- accidentally ignore the result.
create or replace function public.assert_account_access(
  p_user_id       uuid,
  p_account_id    uuid,
  p_currency_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner    uuid;
  v_currency text;
  v_archived boolean;
begin
  if p_account_id is null then
    return;
  end if;

  select user_id, currency_code, is_archived
    into v_owner, v_currency, v_archived
  from public.accounts
  where id = p_account_id;

  if v_owner is null then
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> p_user_id then
    -- Same error as not-found on purpose: a distinguishable "forbidden"
    -- confirms the account exists, which is an enumeration oracle.
    raise exception 'ACCOUNT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_archived then
    raise exception 'ACCOUNT_ARCHIVED' using errcode = 'P0001';
  end if;
  if v_currency <> p_currency_code then
    -- HelloPera never converts (master plan §11).
    raise exception 'CURRENCY_MISMATCH' using errcode = 'P0001';
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- create_transaction
-- -----------------------------------------------------------------------------

create or replace function public.create_transaction(
  p_user_id              uuid,
  p_type                 text,
  p_amount               numeric,
  p_currency_code        text,
  p_transaction_date     date,
  p_source_account_id    uuid   default null,
  p_destination_account_id uuid default null,
  p_category_id          uuid   default null,
  p_direction            text   default null,
  p_merchant_name        text   default null,
  p_description          text   default null,
  p_notes                text   default null,
  p_refund_of            uuid   default null
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

  if p_category_id is not null then
    if not exists (
      select 1 from public.categories
      where id = p_category_id and (is_system or user_id = p_user_id)
    ) then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  -- Lock the affected accounts in a stable order (by id) so two concurrent
  -- writes touching the same pair cannot deadlock by grabbing them opposite
  -- ways round.
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

  -- Recompute from the ledger rather than incrementing the cache: an
  -- increment that runs twice is undetectable, a recompute is idempotent.
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

-- -----------------------------------------------------------------------------
-- void_transaction
--
-- Voiding, never deleting (§32). The row stays visible in history and audit;
-- it simply stops affecting balances.
-- -----------------------------------------------------------------------------

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
  v_tx public.transactions%rowtype;
begin
  select * into v_tx from public.transactions
  where id = p_id and user_id = p_user_id
  for update;

  if v_tx.id is null then
    raise exception 'TRANSACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_tx.status = 'voided' then
    -- Idempotent: a double submit must not produce a second audit entry.
    return;
  end if;

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

-- -----------------------------------------------------------------------------
-- create_account
--
-- The account and its opening_balance transaction are created together.
-- Separately, a crash between them leaves an account whose stated opening
-- balance has no ledger entry behind it.
-- -----------------------------------------------------------------------------

create or replace function public.create_account(
  p_user_id          uuid,
  p_name             text,
  p_type             text,
  p_nature           text,
  p_currency_code    text,
  p_opening_balance  numeric default 0,
  p_institution_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  insert into public.accounts
    (user_id, name, type, nature, currency_code, opening_balance, institution_name)
  values
    (p_user_id, btrim(p_name), p_type, p_nature, upper(p_currency_code),
     coalesce(p_opening_balance, 0),
     nullif(btrim(coalesce(p_institution_name, '')), ''))
  returning id into v_id;

  -- Only when non-zero: an opening_balance row of 0 is noise in the ledger.
  if coalesce(p_opening_balance, 0) <> 0 then
    insert into public.transactions
      (user_id, type, direction, amount, currency_code, transaction_date,
       destination_account_id, status, description)
    values
      (p_user_id, 'opening_balance',
       case when p_opening_balance < 0 then 'decrease' else 'increase' end,
       abs(p_opening_balance), upper(p_currency_code), current_date,
       v_id, 'confirmed', 'Opening balance');
  end if;

  perform public.recalculate_account_balance(v_id);

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'account', v_id, 'account_created',
     jsonb_build_object('name', p_name, 'type', p_type, 'nature', p_nature));

  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Integrity check (§36, and Phase 14 §64)
-- -----------------------------------------------------------------------------

create or replace function public.check_balance_integrity(p_user_id uuid)
returns table (account_id uuid, account_name text, cached numeric, derived numeric)
language plpgsql
security definer
set search_path = ''
as $$
begin
  return query
  select a.id, a.name, a.current_balance,
         public.recalculate_account_balance(a.id)
  from public.accounts a
  where a.user_id = p_user_id;
end;
$$;

comment on function public.check_balance_integrity(uuid) is
  'Reports cached vs derived balance per account. Recalculating repairs as it reads, so run it to both detect and fix drift.';

-- Callable by the service role only. These bypass RLS by design.
revoke all on function public.create_transaction from anon, authenticated;
revoke all on function public.void_transaction   from anon, authenticated;
revoke all on function public.create_account     from anon, authenticated;
revoke all on function public.assert_account_access from anon, authenticated;
revoke all on function public.recalculate_account_balance from anon, authenticated;
revoke all on function public.check_balance_integrity from anon, authenticated;
