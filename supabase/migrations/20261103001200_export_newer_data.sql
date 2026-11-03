-- HP-038: the export leaves out data added after September.
--
-- loan_details and account_details came with loans and bank accounts, and
-- bills gained installment columns, receivables a borrowed_date, and
-- generated rows a recurring_rule_id. None of it reached the export, so a
-- user taking their data away lost their loan terms. Same snapshot function,
-- with those columns and two new sections. Money stays text.

create or replace function public.export_financial_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'accounts', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, name, type, nature, currency_code, opening_balance::text as opening_balance, current_balance::text as current_balance, institution_name, is_active, is_archived, created_at from public.accounts) r),
  'categories', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, name, type, is_system, is_active, created_at from public.categories) r),
  'transactions', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, type, direction, amount::text as amount, currency_code, transaction_date, source_account_id, destination_account_id, category_id, merchant_name, description, notes, status, void_reason, created_at from public.transactions) r),
  'bills', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, provider_name, description, category_id, amount::text as amount, currency_code, due_date, status, notes, installment_amount::text as installment_amount, installment_count, installments_prior, recurring_rule_id, created_at from public.bills) r),
  'receivables', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, party_name, description, amount::text as amount, currency_code, borrowed_date, due_date, status, notes, created_at from public.receivables) r),
  'expected_income', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, source_name, description, category_id, amount::text as amount, currency_code, expected_date, status, notes, recurring_rule_id, created_at from public.expected_income) r),
  'recurring_rules', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, rule_type, name, description, amount::text as amount, currency_code, frequency, interval_count, day_of_month, day_of_week, start_date, end_date, is_active, is_paused, created_at from public.recurring_rules) r),
  'documents', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, document_type, original_filename, original_mime_type, original_size_bytes, processing_status, retention_status, created_at from public.documents) r),
  'bill_payments', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, bill_id, transaction_id, amount_applied::text as amount_applied, created_at from public.bill_payments) r),
  'receivable_payments', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, receivable_id, transaction_id, amount_applied::text as amount_applied, created_at from public.receivable_payments) r),
  'expected_income_receipts', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, expected_income_id, transaction_id, amount_applied::text as amount_applied, created_at from public.expected_income_receipts) r),
  'expected_events', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, recurring_rule_id, event_type, name, amount::text as amount, currency_code, scheduled_date, status, account_id, category_id, actual_transaction_id, include_in_forecast, detached_from_rule, source_entity_type, source_entity_id, created_at from public.expected_events) r),
  'loan_details', (select coalesce(jsonb_agg(r order by r.account_id),'[]'::jsonb) from (select account_id, principal::text as principal, start_date, interest_rate_apr::text as interest_rate_apr, term_months, payment_amount::text as payment_amount, payment_frequency, next_due_date, recurring_rule_id, created_at from public.loan_details) r),
  'account_details', (select coalesce(jsonb_agg(r order by r.account_id),'[]'::jsonb) from (select account_id, last4, kind, created_at from public.account_details) r)
) where auth.uid() is not null;
$$;
revoke all on function public.export_financial_snapshot() from public,anon;
grant execute on function public.export_financial_snapshot() to authenticated;
