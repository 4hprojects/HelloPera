-- One MVCC snapshot for every export section; authenticated RLS scopes all reads.
create or replace function public.export_financial_snapshot() returns jsonb
language sql stable security invoker set search_path='' as $$
select jsonb_build_object(
  'accounts', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, name, type, nature, currency_code, opening_balance::text as opening_balance, current_balance::text as current_balance, institution_name, is_active, is_archived, created_at from public.accounts) r),
  'categories', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, name, type, is_system, is_active, created_at from public.categories) r),
  'transactions', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, type, direction, amount::text as amount, currency_code, transaction_date, source_account_id, destination_account_id, category_id, merchant_name, description, notes, status, void_reason, created_at from public.transactions) r),
  'bills', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, provider_name, description, category_id, amount::text as amount, currency_code, due_date, status, notes, created_at from public.bills) r),
  'receivables', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, party_name, description, amount::text as amount, currency_code, due_date, status, notes, created_at from public.receivables) r),
  'expected_income', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, source_name, description, category_id, amount::text as amount, currency_code, expected_date, status, notes, created_at from public.expected_income) r),
  'recurring_rules', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, rule_type, name, description, amount::text as amount, currency_code, frequency, interval_count, day_of_month, day_of_week, start_date, end_date, is_active, is_paused, created_at from public.recurring_rules) r),
  'documents', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, document_type, original_filename, original_mime_type, original_size_bytes, processing_status, retention_status, created_at from public.documents) r),
  'bill_payments', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, bill_id, transaction_id, amount_applied::text as amount_applied, created_at from public.bill_payments) r),
  'receivable_payments', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, receivable_id, transaction_id, amount_applied::text as amount_applied, created_at from public.receivable_payments) r),
  'expected_income_receipts', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, expected_income_id, transaction_id, amount_applied::text as amount_applied, created_at from public.expected_income_receipts) r),
  'expected_events', (select coalesce(jsonb_agg(r order by r.id),'[]'::jsonb) from (select id, recurring_rule_id, event_type, name, amount::text as amount, currency_code, scheduled_date, status, account_id, category_id, actual_transaction_id, include_in_forecast, detached_from_rule, source_entity_type, source_entity_id, created_at from public.expected_events) r)
) where auth.uid() is not null;
$$;
revoke all on function public.export_financial_snapshot() from public,anon;
grant execute on function public.export_financial_snapshot() to authenticated;

-- Complete obligation totals, including more than 1,000 allocation links.
create or replace function public.read_obligations(
  p_kind text, p_archived boolean default false, p_open boolean default false,
  p_from date default null, p_to date default null, p_id uuid default null,
  p_offset integer default 0, p_limit integer default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text; links text; fk text; date_col text; result jsonb;
begin
  case p_kind
    when 'bill' then t:='bills'; links:='bill_payments'; fk:='bill_id'; date_col:='due_date';
    when 'receivable' then t:='receivables'; links:='receivable_payments'; fk:='receivable_id'; date_col:='due_date';
    when 'expected_income' then t:='expected_income'; links:='expected_income_receipts'; fk:='expected_income_id'; date_col:='expected_date';
    else raise exception 'UNKNOWN_OBLIGATION_TYPE';
  end case;
  execute format('select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(''amount'',o.amount::text,%L,
    jsonb_build_array(jsonb_build_object(''amount_applied'',(select coalesce(sum(l.amount_applied),0)::text from public.%I l where l.%I=o.id))))
    order by o.%I,o.id),''[]''::jsonb) from (select * from public.%I
    where ($1 or not is_archived) and (not $2 or status in (''open'',''partially_paid''))
    and ($3 is null or %I >= $3) and ($4 is null or %I <= $4) and ($5 is null or id=$5)
    order by %I,id limit $7 offset $6) o',links,links,fk,date_col,t,date_col,date_col,date_col)
    into result using p_archived,p_open,p_from,p_to,p_id,p_offset,p_limit;
  return result;
end $$;
revoke all on function public.read_obligations(text,boolean,boolean,date,date,uuid,integer,integer) from public,anon;
grant execute on function public.read_obligations(text,boolean,boolean,date,date,uuid,integer,integer) to authenticated;
