-- HP-007: take the account lock before deriving its balance.
--
-- recalculate_account_balance derived the balance, then updated the account.
-- Under READ COMMITTED a concurrent writer can be holding that row: for
-- example create_transaction, which locks its accounts, inserts, and
-- recalculates. A void or edit running at the same time derived its figure
-- from a snapshot without the new entry, waited on the row lock, and then
-- wrote that stale figure over the correct one once the insert committed. The
-- balance silently missed a transaction until the next write to the account.
--
-- Locking first makes the derivation a later statement, with a snapshot taken
-- after any concurrent writer has committed. The worst case left is a
-- deadlock between two writers that lock the same two accounts in opposite
-- order. Postgres detects it and fails one of them, which the user retries.
-- That is an error, not a wrong balance.

create or replace function public.recalculate_account_balance(p_account_id uuid)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(18, 2);
begin
  perform 1 from public.accounts where id = p_account_id for update;
  v_balance := public.derive_account_balance(p_account_id);
  update public.accounts set current_balance = v_balance where id = p_account_id;
  return v_balance;
end;
$$;

comment on function public.recalculate_account_balance(uuid) is
  'Locks the account, then derives via derive_account_balance and writes the cache. Called after every balance-affecting write.';
