-- =============================================================================
-- Security fix — SECURITY DEFINER functions were executable by every browser
--
-- ## The bug
--
-- Every migration since Phase 02 protected its RPCs like this:
--
--   revoke all on function public.create_account from anon, authenticated;
--
-- That statement does nothing. Postgres grants EXECUTE on a new function to
-- **PUBLIC** by default, and `anon`/`authenticated` never held a grant of
-- their own to revoke — they inherit it from PUBLIC. The function's ACL still
-- reads `=X/postgres`, which is PUBLIC holding EXECUTE.
--
-- Sixteen SECURITY DEFINER functions were therefore callable by anyone holding
-- the publishable key, through PostgREST's /rpc/ endpoint. None of them checks
-- `auth.uid()` — by design, because the write-path rule (master plan §33) says
-- only server actions using the secret key may call them, and they take the
-- owning `user_id` as a parameter and trust it.
--
-- Measured against a live database, signed in as an ordinary user:
--
--   select public.create_account('<other user id>','PWNED','cash','asset',
--                                'PHP', 999999, null);
--   -> created a ₱999,999 account owned by a different user
--
--   select public.advance_rule_cursor('<other user rule>','2030-01-01');
--   -> silently stopped that user's recurring rule for four years
--
-- RLS was never the thing that failed: these functions run as their owner, so
-- RLS does not apply to them at all. The only barrier was meant to be EXECUTE,
-- and EXECUTE was never actually withdrawn.
--
-- ## The fix
--
-- `revoke ... from public` is the statement that removes the default grant.
-- The role-specific revokes are kept alongside it: harmless, and they document
-- the intent for anyone reading only this file.
--
-- `alter default privileges` then stops the next function from arriving with
-- the same hole, which is the part that keeps this fixed rather than fixed
-- once.
--
-- Idempotent.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Withdraw PUBLIC's default EXECUTE from every SECURITY DEFINER function.
--
-- Named explicitly rather than looped over the catalogue, so this file states
-- exactly what it changes and a reviewer can check the list against the
-- migrations that created them.
-- -----------------------------------------------------------------------------

do $$
declare
  fn text;
  names text[] := array[
    -- Phase 02 — financial core
    'create_account', 'create_transaction', 'void_transaction',
    'assert_account_access', 'recalculate_account_balance',
    'check_balance_integrity', 'assert_income_destination',
    -- Phase 03 — obligations
    'allocate_payment', 'unlink_payment',
    -- Phase 05 — OCR
    'confirm_extraction', 'discard_extraction',
    -- Phase 07 — recurring and forecasting
    'generate_occurrence', 'advance_rule_cursor',
    'begin_job', 'finish_job', 'run_recurring_generation', 'occurrence_at'
  ];
begin
  foreach fn in array names loop
    begin
      -- Every overload of the name. `revoke ... from public` is the operative
      -- clause; the roles are listed for the reader.
      execute format(
        'revoke all on function public.%I from public, anon, authenticated', fn
      );
    exception when undefined_function then
      raise notice 'skipping %: not present', fn;
    end;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 2. Grant EXECUTE back to service_role, which is what the server actions use.
--
-- Only the seven the application actually calls. The rest are internal helpers
-- invoked from inside other SECURITY DEFINER functions, which run as the owner
-- and therefore need no grant of their own.
-- -----------------------------------------------------------------------------

do $$
declare
  fn text;
  names text[] := array[
    'create_account', 'create_transaction', 'void_transaction',
    'allocate_payment', 'confirm_extraction', 'discard_extraction',
    'run_recurring_generation'
  ];
begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise notice 'service_role absent; skipping grants';
    return;
  end if;

  foreach fn in array names loop
    begin
      execute format('grant execute on function public.%I to service_role', fn);
    exception when undefined_function then
      raise notice 'skipping %: not present', fn;
    end;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 3. Stop the next function from arriving with the same hole.
--
-- Without this, the fix lasts exactly until someone adds a migration — the
-- default grant to PUBLIC applies at CREATE FUNCTION time, so every new
-- function would be born exposed and the `revoke ... from anon, authenticated`
-- idiom would keep looking like protection.
-- -----------------------------------------------------------------------------

alter default privileges in schema public revoke execute on functions from public;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    alter default privileges in schema public revoke execute on functions from authenticated;
  end if;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    alter default privileges in schema public revoke execute on functions from anon;
  end if;
end $$;
