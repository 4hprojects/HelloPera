-- HP-026: privileged administrative changes and their audit record commit or
-- roll back together. Service-role only; the caller (adminAction) has already
-- authenticated the admin, and this function re-validates actor, reason and
-- self-targeting so the database does not rely on the application alone.

create or replace function public.admin_apply_change(
  p_actor uuid, p_event text, p_op text, p_target uuid, p_entity uuid,
  p_reason text, p_args jsonb default '{}'::jsonb, p_metadata jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_result jsonb := '{}'::jsonb;
  v_reason text := btrim(coalesce(p_reason,''));
  v_row record;
  v_n integer;
begin
  if p_actor is null or not exists (
    select 1 from public.profiles where id=p_actor and role='admin' and status='active'
  ) then
    raise exception 'ADMIN_REQUIRED' using errcode='P0001';
  end if;
  if char_length(v_reason) < 3 or char_length(v_reason) > 500 then
    raise exception 'REASON_REQUIRED' using errcode='P0001';
  end if;
  if p_op in ('set_status','set_role') and p_target = p_actor then
    raise exception 'SELF_TARGET' using errcode='P0001';
  end if;

  if p_op = 'set_status' then
    update public.profiles set status=p_args->>'status', updated_at=now() where id=p_target;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'TARGET_NOT_FOUND' using errcode='P0001'; end if;
  elsif p_op = 'set_role' then
    update public.profiles set role=p_args->>'role', updated_at=now() where id=p_target;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'TARGET_NOT_FOUND' using errcode='P0001'; end if;
  elsif p_op = 'add_note' then
    insert into public.admin_support_notes(user_id,admin_user_id,note)
    values(p_target,p_actor,p_args->>'note');
  elsif p_op = 'set_flag' then
    update public.feature_flags
    set enabled=(p_args->>'enabled')::boolean, updated_at=now(), updated_by=p_actor
    where key=p_args->>'key';
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'TARGET_NOT_FOUND' using errcode='P0001'; end if;
  elsif p_op = 'grant_override' then
    insert into public.entitlement_overrides(user_id,entitlement_key,value_json,reason,ends_at,created_by)
    values(p_target,p_args->>'key',p_args->'value',v_reason,
           nullif(p_args->>'endsAt','')::timestamptz,p_actor);
  elsif p_op = 'revoke_override' then
    update public.entitlement_overrides set ends_at=now() where id=p_entity;
    get diagnostics v_n = row_count;
    if v_n <> 1 then raise exception 'TARGET_NOT_FOUND' using errcode='P0001'; end if;
  elsif p_op = 'adjust_usage' then
    insert into public.usage_adjustments(user_id,feature_key,quantity_delta,reason,created_by)
    values(p_target,p_args->>'featureKey',(p_args->>'delta')::integer,v_reason,p_actor);
  elsif p_op = 'repair_balance' then
    select * into v_row from public.repair_account_balance(p_entity);
    v_result := jsonb_build_object('previous',v_row.previous::text,'corrected',v_row.corrected::text);
    p_metadata := p_metadata || v_result;
  elsif p_op = 'integrity_check' then
    v_result := public.run_financial_integrity_check();
  else
    raise exception 'UNKNOWN_ADMIN_OPERATION' using errcode='P0001';
  end if;

  insert into public.audit_logs(actor_user_id,target_user_id,entity_type,entity_id,event_type,metadata)
  values(p_actor,p_target,'admin',p_entity,p_event,
         coalesce(p_metadata,'{}'::jsonb) || jsonb_build_object('reason',v_reason));
  return v_result;
end $$;

revoke all on function public.admin_apply_change(uuid,text,text,uuid,uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.admin_apply_change(uuid,text,text,uuid,uuid,text,jsonb,jsonb) to service_role;
