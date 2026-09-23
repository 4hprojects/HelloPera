-- Durable deletion state and one-use, short-lived reauthentication challenges.
create table if not exists public.account_deletions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stage text not null default 'files' check(stage in ('files','auth')),
  started_at timestamptz not null default now()
);
create table if not exists public.deletion_challenges (
  token_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  approved_at timestamptz,
  consumed_at timestamptz
);
create index if not exists deletion_challenges_user_idx on public.deletion_challenges(user_id);
alter table public.account_deletions enable row level security;
alter table public.deletion_challenges enable row level security;
revoke all on public.account_deletions,public.deletion_challenges from public,anon,authenticated;
grant all on public.account_deletions,public.deletion_challenges to service_role;
grant select on public.account_deletions to authenticated;
drop policy if exists deletion_read_own on public.account_deletions;
create policy deletion_read_own on public.account_deletions for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.begin_account_deletion(p_user_id uuid,p_challenge_hash text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  perform 1 from public.profiles where id=p_user_id and status='active' for update;
  if not found then raise exception 'USER_UNAVAILABLE'; end if;
  -- Null is used only after a server-verified password. OAuth must consume a challenge.
  if p_challenge_hash is not null then
    update public.deletion_challenges set consumed_at=now()
      where token_hash=p_challenge_hash and user_id=p_user_id
        and approved_at is not null and consumed_at is null and expires_at>now();
    if not found then raise exception 'REAUTHENTICATION_REQUIRED'; end if;
  end if;
  insert into public.account_deletions(user_id) values(p_user_id) on conflict do nothing;
end $$;
revoke all on function public.begin_account_deletion(uuid,text) from public,anon,authenticated;
grant execute on function public.begin_account_deletion(uuid,text) to service_role;

create or replace function public.reject_writes_during_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid;
begin
  v_user := new.user_id;
  perform 1 from public.profiles where id=v_user for share;
  if exists(select 1 from public.account_deletions where user_id=v_user) then
    raise exception 'ACCOUNT_DELETION_IN_PROGRESS';
  end if;
  return new;
end $$;
revoke all on function public.reject_writes_during_deletion() from public,anon,authenticated;
do $$ declare t text; begin
  for t in select table_name from information_schema.columns where table_schema='public' and column_name='user_id'
    and table_name not in ('account_deletions','deletion_challenges')
  loop
    execute format('drop trigger if exists reject_writes_during_deletion on public.%I',t);
    execute format('create trigger reject_writes_during_deletion before insert or update on public.%I for each row execute function public.reject_writes_during_deletion()',t);
  end loop;
end $$;

-- Stop an in-flight upload from creating new files after the deletion sweep.
create or replace function public.reject_storage_during_deletion() returns trigger
language plpgsql security definer set search_path='' as $$
declare v_user uuid; v_prefix text;
begin
  if new.bucket_id <> 'hello-pera-documents' then return new; end if;
  v_prefix := split_part(new.name,'/',1);
  if v_prefix !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return new; end if;
  v_user := v_prefix::uuid;
  perform 1 from public.profiles where id=v_user for share;
  if exists(select 1 from public.account_deletions where user_id=v_user) then raise exception 'ACCOUNT_DELETION_IN_PROGRESS'; end if;
  return new;
end $$;
revoke all on function public.reject_storage_during_deletion() from public,anon,authenticated;
drop trigger if exists reject_storage_during_deletion on storage.objects;
create trigger reject_storage_during_deletion before insert or update on storage.objects
  for each row execute function public.reject_storage_during_deletion();

create or replace function public.erase_deleted_user_audit() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  delete from public.audit_logs where actor_user_id=old.id or target_user_id=old.id;
  delete from public.subscription_events where user_id=old.id;
  insert into public.audit_logs(entity_type,event_type,metadata)
    values('auth','account_deleted','{}'::jsonb);
  return old;
end $$;
revoke all on function public.erase_deleted_user_audit() from public,anon,authenticated;
drop trigger if exists erase_deleted_user_audit on auth.users;
create trigger erase_deleted_user_audit before delete on auth.users
  for each row execute function public.erase_deleted_user_audit();
-- Previously detached deletion records must not retain an email.
update public.audit_logs set metadata='{}'::jsonb,before_data=null,after_data=null,entity_id=null
  where entity_type='auth' and actor_user_id is null and target_user_id is null;
