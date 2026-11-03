-- HP-025: the ledger freeze, enforced by the database on every write path.
--
-- financial_writes_enabled was checked by the server actions and by the
-- scheduled generator, but not by the ordinary write RPCs or the admin-client
-- inserts, so a path that forgot the action-level check could still write
-- while the ledger was frozen. A statement-level trigger on each financial
-- table now calls assert_financial_writes_enabled(), which fails closed when
-- the flag is off or missing.
--
-- Inserts and updates only. Deletes stay possible, so account deletion and
-- the removal of a never-used account still work during a freeze. One check
-- per statement, so a bulk write costs one flag read.

create or replace function public.reject_writes_while_frozen() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.assert_financial_writes_enabled();
  return null;
end $$;
revoke all on function public.reject_writes_while_frozen() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array[
    'accounts', 'transactions', 'bills', 'receivables', 'expected_income',
    'bill_payments', 'receivable_payments', 'expected_income_receipts',
    'recurring_rules', 'expected_events', 'loan_details', 'account_details'
  ] loop
    execute format('drop trigger if exists reject_writes_while_frozen on public.%I', t);
    execute format('create trigger reject_writes_while_frozen before insert or update on public.%I for each statement execute function public.reject_writes_while_frozen()', t);
  end loop;
end $$;
