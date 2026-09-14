-- =============================================================================
-- profiles: first_name / last_name, with full_name as a generated column
--
-- `full_name` was a single nullable column, and the only thing that read it
-- recovered a first name with `full_name.split(' ')[0]`. That heuristic is
-- wrong for a large share of Filipino names — "Ma. Cristina Reyes" greets the
-- user as "Ma." — and it was the sole reason the column was read at all.
--
-- Google already sends `given_name` and `family_name` in raw_user_meta_data.
-- The trigger below now reads them instead of throwing the structure away and
-- re-deriving it badly.
--
-- ## Why full_name becomes GENERATED rather than a column the app maintains
--
-- Two writable columns holding overlapping truth drift. The application would
-- have to remember to update the display name on every path that touches a
-- part — register, settings, and any future admin edit — and the one that
-- forgets produces a profile whose displayed name disagrees with its own
-- fields. A generated column cannot disagree.
--
-- ## The nullif is load-bearing
--
-- Without it, a user with no name gets `''` rather than NULL. Every display
-- fallback in the app is `profile.full_name ?? email`, and `??` does not catch
-- the empty string — so the sidebar and top bar would render a blank name and
-- blank avatar initials instead of falling back to the email.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The new columns.
-- -----------------------------------------------------------------------------

alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists last_name  text;

-- -----------------------------------------------------------------------------
-- 2. Convert full_name.
--
-- Guarded on the column still being an ordinary one, so re-running is a no-op
-- rather than an error. The backfill runs BEFORE the drop: nothing has been
-- applied to a live database yet, but a migration that would lose data if it
-- ever met some is a migration written wrong.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'profiles'
       and column_name  = 'full_name'
       and is_generated = 'NEVER'
  ) then
    -- Everything before the first space is the given name; the remainder is
    -- the surname. The same heuristic this migration exists to retire, used
    -- once, to avoid discarding names that already exist.
    update public.profiles
       set first_name = coalesce(first_name, nullif(split_part(full_name, ' ', 1), '')),
           last_name  = coalesce(
             last_name,
             nullif(substr(full_name, length(split_part(full_name, ' ', 1)) + 2), '')
           )
     where full_name is not null;

    alter table public.profiles drop column full_name;

    alter table public.profiles
      add column full_name text generated always as (
        nullif(trim(coalesce(first_name, '') || ' ' || coalesce(last_name, '')), '')
      ) stored;
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- 3. The signup trigger.
--
-- Structured fields first, split only as a last resort for providers that send
-- none. `role` and `status` stay hardcoded: OAuth metadata is attacker-adjacent
-- and sign-up payloads are client-controlled, so neither may ever influence
-- authorization.
--
-- `full_name` is absent from the INSERT because it is generated — naming it
-- would make the statement fail outright.
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full  text;
  v_first text;
  v_last  text;
begin
  v_full := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name'
  );

  -- Google supplies these directly; email signup sends them from the form.
  v_first := nullif(trim(coalesce(new.raw_user_meta_data ->> 'given_name', '')), '');
  v_last  := nullif(trim(coalesce(new.raw_user_meta_data ->> 'family_name', '')), '');

  if v_first is null and v_last is null and v_full is not null then
    v_first := nullif(split_part(v_full, ' ', 1), '');
    v_last  := nullif(substr(v_full, length(split_part(v_full, ' ', 1)) + 2), '');
  end if;

  insert into public.profiles (id, email, first_name, last_name, avatar_url, role, status)
  values (
    new.id,
    new.email,
    v_first,
    v_last,
    coalesce(
      new.raw_user_meta_data ->> 'avatar_url',
      new.raw_user_meta_data ->> 'picture'
    ),
    'user',
    'active'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
