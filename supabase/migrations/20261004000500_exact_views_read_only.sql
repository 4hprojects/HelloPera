-- The *_exact views are read-only projections. Supabase's default privileges
-- granted authenticated INSERT/UPDATE/DELETE/TRUNCATE on them when created;
-- revoke everything, then grant SELECT only.

revoke all on public.accounts_exact, public.transactions_exact,
  public.recurring_rules_exact, public.expected_events_exact,
  public.billing_history_exact, public.plans_exact
  from public, anon, authenticated;
grant select on public.accounts_exact, public.transactions_exact,
  public.recurring_rules_exact, public.expected_events_exact,
  public.billing_history_exact, public.plans_exact
  to authenticated, service_role;
