-- HP-005: the last two places money left the database as a JSON number.
--
--   * read_obligations built each row with to_jsonb(o), which turns numeric
--     into a JSON number. amount and the applied total were already overridden
--     with text; bills.installment_amount, added later, was not.
--   * check_financial_integrity returns numeric columns, which PostgREST sends
--     as JSON numbers, so a large or trailing-zero figure reached the admin
--     report already rounded. The function is renamed and wrapped by one that
--     returns the same rows with expected and actual as text, so its body and
--     run_financial_integrity_check stay as they are.

create or replace function public.read_obligations(
  p_kind text, p_archived boolean default false, p_open boolean default false,
  p_from date default null, p_to date default null, p_id uuid default null,
  p_offset integer default 0, p_limit integer default null
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare t text; links text; fk text; date_col text; extra text := ''; result jsonb;
begin
  case p_kind
    when 'bill' then t:='bills'; links:='bill_payments'; fk:='bill_id'; date_col:='due_date';
      extra:=',''installment_amount'',o.installment_amount::text';
    when 'receivable' then t:='receivables'; links:='receivable_payments'; fk:='receivable_id'; date_col:='due_date';
    when 'expected_income' then t:='expected_income'; links:='expected_income_receipts'; fk:='expected_income_id'; date_col:='expected_date';
    else raise exception 'UNKNOWN_OBLIGATION_TYPE';
  end case;
  execute format('select coalesce(jsonb_agg(to_jsonb(o) || jsonb_build_object(''amount'',o.amount::text%s,%L,
    jsonb_build_array(jsonb_build_object(''amount_applied'',(select coalesce(sum(l.amount_applied),0)::text from public.%I l where l.%I=o.id))))
    order by o.%I,o.id),''[]''::jsonb) from (select * from public.%I
    where ($1 or not is_archived) and (not $2 or status in (''open'',''partially_paid''))
    and ($3 is null or %I >= $3) and ($4 is null or %I <= $4) and ($5 is null or id=$5)
    order by %I,id limit $7 offset $6) o',extra,links,links,fk,date_col,t,date_col,date_col,date_col)
    into result using p_archived,p_open,p_from,p_to,p_id,p_offset,p_limit;
  return result;
end $$;
revoke all on function public.read_obligations(text,boolean,boolean,date,date,uuid,integer,integer) from public,anon;
grant execute on function public.read_obligations(text,boolean,boolean,date,date,uuid,integer,integer) to authenticated;

alter function public.check_financial_integrity(uuid) rename to financial_integrity_findings;

create function public.check_financial_integrity(p_user_id uuid default null)
returns table (
  check_name  text,
  user_id     uuid,
  entity_type text,
  entity_id   uuid,
  detail      text,
  expected    text,
  actual      text
)
language sql stable security definer set search_path = '' as $$
  select f.check_name, f.user_id, f.entity_type, f.entity_id, f.detail,
         f.expected::text, f.actual::text
  from public.financial_integrity_findings(p_user_id) f;
$$;

comment on function public.check_financial_integrity(uuid) is
  'PHASE-14 section 64. Reports every integrity mismatch. Writes nothing, ever. Money as text (HP-005).';
revoke all on function public.check_financial_integrity(uuid) from public, anon, authenticated;
grant execute on function public.check_financial_integrity(uuid) to service_role;
