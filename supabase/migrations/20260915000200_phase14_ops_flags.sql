-- =============================================================================
-- Phase 14 — operational flags
--
-- `financial_writes_enabled` (§23) and `retention_enabled` (§73).
--
-- Note the asymmetry in their defaults, which is deliberate:
--
--   financial_writes_enabled  ships ON.  It is a freeze, and a freeze that is
--                                        on by default means a fresh deployment
--                                        silently refuses every transaction.
--   retention_enabled         ships OFF. It deletes things, and §73 says the
--                                        policy must match the privacy page.
--                                        No periods have been decided, so
--                                        nothing should be deleting yet.
--
-- `maintenance_mode` is deliberately NOT here. It is an environment variable,
-- because the usual reason to enter maintenance is that this database is the
-- problem, and a switch stored in the thing it protects is unreadable exactly
-- when it is needed. See lib/ops/kill-switches.ts.
--
-- Idempotent.
-- =============================================================================

insert into public.feature_flags (key, enabled, config)
values
  (
    'financial_writes_enabled',
    true,
    '{"note": "PHASE-14 section 23. Turn OFF to freeze the ledger: records stay readable, nothing can be written."}'::jsonb
  ),
  (
    'retention_enabled',
    false,
    '{"note": "PHASE-14 section 73. Turn ON only once retention periods are decided and match the privacy page."}'::jsonb
  )
on conflict (key) do nothing;
