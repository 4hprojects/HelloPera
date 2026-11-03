-- HP-035: extend the account-deletion write guards to everything added since.
--
-- 20260923000200 attached reject_writes_during_deletion to every public table
-- with a user_id column that existed then. loan_details and account_details
-- came later and had no guard, so an in-flight loan or bank edit could write
-- rows for a user being deleted. The same loop runs again here and covers any
-- table it finds without the trigger.
--
-- reject_storage_during_deletion reads the owner from the first path segment,
-- so staged uploads under incoming/<uid>/ passed it. A second trigger reads
-- the owner of staged paths. It is separate rather than a new body for the
-- first, so re-running 20260923000200 cannot quietly remove it.

do $$ declare t text; begin
  for t in
    select c.table_name from information_schema.columns c
    where c.table_schema = 'public' and c.column_name = 'user_id'
      and c.table_name not in ('account_deletions', 'deletion_challenges')
      and exists (
        select 1 from information_schema.tables it
        where it.table_schema = 'public' and it.table_name = c.table_name
          and it.table_type = 'BASE TABLE')
      and not exists (
        select 1 from pg_trigger tg
        where tg.tgname = 'reject_writes_during_deletion'
          and tg.tgrelid = format('public.%I', c.table_name)::regclass)
  loop
    execute format('create trigger reject_writes_during_deletion before insert or update on public.%I for each row execute function public.reject_writes_during_deletion()', t);
  end loop;
end $$;

create or replace function public.reject_staged_storage_during_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_owner text;
begin
  if new.bucket_id <> 'hello-pera-documents' or split_part(new.name, '/', 1) <> 'incoming' then
    return new;
  end if;
  v_owner := split_part(new.name, '/', 2);
  if v_owner !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  v_user := v_owner::uuid;
  perform 1 from public.profiles where id = v_user for share;
  if exists (select 1 from public.account_deletions where user_id = v_user) then
    raise exception 'ACCOUNT_DELETION_IN_PROGRESS';
  end if;
  return new;
end $$;
revoke all on function public.reject_staged_storage_during_deletion() from public, anon, authenticated;
drop trigger if exists reject_staged_storage_during_deletion on storage.objects;
create trigger reject_staged_storage_during_deletion before insert or update on storage.objects
  for each row execute function public.reject_staged_storage_during_deletion();
