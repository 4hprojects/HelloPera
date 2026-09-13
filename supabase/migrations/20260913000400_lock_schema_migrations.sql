-- =============================================================================
-- Lock down schema_migrations.
--
-- The migration runner created this table with a plain CREATE TABLE, so
-- Supabase's default grants applied and anon/authenticated received ALL
-- privileges — including TRUNCATE. It holds no user data, but an anonymous
-- visitor being able to erase migration history is exactly the kind of default
-- that should never survive a verification pass.
--
-- Caught by supabase/VERIFY-RLS.sql, which is why that file checks grants and
-- not just policies.
-- =============================================================================

alter table if exists public.schema_migrations enable row level security;
alter table if exists public.schema_migrations force  row level security;

revoke all on public.schema_migrations from anon, authenticated;

-- No policies at all: this table is for the migration runner, which connects
-- as the database owner and is unaffected by RLS grants to PostgREST roles.
