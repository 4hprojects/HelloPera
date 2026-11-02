-- A record may only use a system category or one its owner made.
--
-- Bills, expected income and recurring rules are created with the service
-- role, which bypasses RLS, and only zod's uuid() check stood between a form
-- field and another user's category id. The edit RPCs check ownership; the
-- create paths did not. One trigger on every table with a category_id closes
-- all of them, including paths added later.
--
-- Ownership only, deliberately not is_active: generate_occurrence copies a
-- rule's category, and refusing a category deactivated after the rule was
-- made would fail the whole scheduled run. Checked on insert, and on update
-- only when the category changes, so existing rows are never re-judged.

create or replace function public.assert_category_owned()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.category_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.category_id is not distinct from old.category_id then
    return new;
  end if;
  if not exists (
    select 1 from public.categories c
    where c.id = new.category_id and (c.is_system or c.user_id = new.user_id)
  ) then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.assert_category_owned from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['transactions', 'bills', 'expected_income',
                           'recurring_rules', 'expected_events'] loop
    execute format('drop trigger if exists category_owned on public.%I', t);
    execute format(
      'create trigger category_owned before insert or update of category_id '
      'on public.%I for each row execute function public.assert_category_owned()', t);
  end loop;
end;
$$;
