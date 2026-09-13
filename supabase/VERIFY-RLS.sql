-- =============================================================================
-- RLS verification — Phase 01 §51
--
-- Run in the Supabase SQL editor after applying the migration. Each block
-- states what MUST happen. A test that only confirms the UI hides a control
-- proves nothing; these exercise the database directly.
-- =============================================================================

-- 1. RLS is on AND forced (forced matters: without it the table owner bypasses).
select
  relname,
  relrowsecurity      as rls_enabled,
  relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;
-- EXPECT: true/true for EVERY table. A table added later without RLS shows up
-- here, which is the point — checking a fixed list would miss it.

-- 2. Only the intended policies exist.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
-- EXPECT: exactly two rows, both cmd = SELECT, both roles = {authenticated}.
-- Any INSERT/UPDATE/DELETE policy for authenticated is a bug.

-- 3. auth.uid() is wrapped in a subselect (per-query, not per-row).
select policyname, qual
from pg_policies
where schemaname = 'public';
-- EXPECT: qual contains "( SELECT auth.uid()" — not a bare auth.uid().

-- 4. Privileges are minimal.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
-- EXPECT: authenticated has SELECT and nothing else. anon appears nowhere.
--
-- Supabase grants anon/authenticated ALL on new public tables by default, so
-- any table created without an explicit REVOKE will show INSERT/UPDATE/DELETE/
-- TRUNCATE here. That default is how schema_migrations shipped writable to
-- anonymous users on the first run of this file.

-- 5. The trigger exists and is armed.
select tgname, tgenabled
from pg_trigger
where tgrelid = 'auth.users'::regclass and not tgisinternal;
-- EXPECT: on_auth_user_created, tgenabled = 'O'.

-- 6. SECURITY DEFINER functions pin search_path.
select p.proname, p.prosecdef, p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('handle_new_user', 'set_updated_at');
-- EXPECT: handle_new_user has prosecdef = true AND proconfig = {search_path=}.
-- A SECURITY DEFINER function without a pinned search_path is exploitable.

-- 7. Every profile has a legal role and status.
select role, status, count(*) from public.profiles group by 1, 2;
-- EXPECT: only user/admin and active/suspended/disabled.
