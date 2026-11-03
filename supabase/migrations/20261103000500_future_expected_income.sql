-- HP-033: "this and all later pay dates" as one audited transaction.
--
-- It was two separate writes from the app (the rule, then the later rows), so
-- a failure between them left the rule and its pay dates disagreeing, and no
-- audit row was written. It also overwrote later dates the user had edited by
-- hand, because every open later row was updated.
--
-- A later row is now carried forward only while it still holds what the rule
-- generated: the same source, amount, description and category as the rule
-- before this edit (see generate_occurrence). A row edited on its own keeps
-- its edit, as does anything received, cancelled or archived, and every date
-- on or before p_after_date.

create or replace function public.update_future_expected_income(
  p_user_id     uuid,
  p_rule_id     uuid,
  p_after_date  date,
  p_name        text,
  p_amount      numeric,
  p_description text,
  p_category_id uuid
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  r       public.recurring_rules%rowtype;
  v_name  text := nullif(btrim(coalesce(p_name, '')), '');
  v_desc  text := nullif(btrim(coalesce(p_description, '')), '');
  v_count integer;
begin
  perform public.assert_financial_writes_enabled();

  select * into r from public.recurring_rules
  where id = p_rule_id and user_id = p_user_id and rule_type = 'expected_income'
  for update;
  if r.id is null then raise exception 'RULE_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_name is null then raise exception 'NAME_REQUIRED' using errcode = 'P0001'; end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'AMOUNT_INVALID' using errcode = 'P0001';
  end if;

  update public.expected_income e
    set source_name = v_name, amount = p_amount,
        description = v_desc, category_id = p_category_id
  where e.user_id = p_user_id
    and e.recurring_rule_id = p_rule_id
    and e.status = 'open'
    and e.is_archived = false
    and e.expected_date > p_after_date
    and e.source_name = coalesce(r.source_name, r.name)
    and e.amount = r.amount
    and e.description is not distinct from r.description
    and e.category_id is not distinct from r.category_id;
  get diagnostics v_count = row_count;

  update public.recurring_rules
    set name = v_name, source_name = v_name, amount = p_amount,
        description = v_desc, category_id = p_category_id, updated_at = now()
  where id = p_rule_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type,
     before_data, after_data, metadata)
  values
    (p_user_id, p_user_id, 'recurring_rule', p_rule_id, 'recurring_rule_updated',
     jsonb_build_object('name', r.name, 'amount', r.amount::text,
                        'description', r.description, 'category_id', r.category_id),
     jsonb_build_object('name', v_name, 'amount', p_amount::numeric(18,2)::text,
                        'description', v_desc, 'category_id', p_category_id),
     jsonb_build_object('scope', 'future', 'after_date', p_after_date,
                        'rows_updated', v_count));

  return v_count;
end;
$$;

revoke all on function public.update_future_expected_income from public, anon, authenticated;
grant execute on function public.update_future_expected_income to service_role;
