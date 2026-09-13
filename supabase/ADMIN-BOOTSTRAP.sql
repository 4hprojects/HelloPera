-- =============================================================================
-- First-admin bootstrap — Phase 01 §28
--
-- NOT a migration. Run manually, once, after registering normally.
-- Kept out of supabase/migrations/ deliberately: a migration that grants admin
-- would re-run in every environment and hardcode a person into the schema.
--
-- Procedure:
--   1. Register through the app (email or Google) and verify your email.
--   2. Find your user id below.
--   3. Promote, with a reason.
--   4. Confirm /admin loads for you and 403s for a normal user.
--
-- Never hardcode a personal email address in application source.
-- =============================================================================

-- Step 1 — find the user id.
select id, email, created_at
from auth.users
order by created_at desc
limit 10;

-- Step 2 — promote. Replace the placeholder with the id from step 1.
-- The audit row is part of the operation, not an afterthought: a role change
-- with no record of who made it or why is the one change you will most want
-- to explain later.
do $$
declare
  target_id uuid := '00000000-0000-0000-0000-000000000000';  -- <-- replace
  reason    text := 'Initial admin bootstrap';
  prev_role text;
begin
  if target_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace target_id with a real user id first.';
  end if;

  select role into prev_role from public.profiles where id = target_id;
  if prev_role is null then
    raise exception 'No profile for %. Register and verify first.', target_id;
  end if;

  update public.profiles set role = 'admin' where id = target_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data, metadata)
  values
    (target_id, target_id, 'profile', target_id, 'role_changed',
     jsonb_build_object('role', prev_role),
     jsonb_build_object('role', 'admin'),
     jsonb_build_object('reason', reason, 'method', 'sql_bootstrap'));

  raise notice 'Promoted % from % to admin.', target_id, prev_role;
end $$;

-- Step 3 — verify.
select id, email, role, status from public.profiles where role = 'admin';
