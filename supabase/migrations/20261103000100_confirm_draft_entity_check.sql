-- confirm_extraction_draft: verify the record being linked.
--
-- The function accepted any p_entity_id and wrote it into document_links and
-- corrected_data. It is service-role only and the app passes ids it just
-- created, so this is defence in depth: the id must now exist, belong to
-- p_user_id, and be of p_entity_type (ENTITY_NOT_FOUND otherwise).
--
-- Unchanged otherwise; see 20261004001300_extraction_drafts.sql.

create or replace function public.confirm_extraction_draft(
  p_user_id       uuid,
  p_extraction_id uuid,
  p_draft_index   integer,
  p_entity_type   text,
  p_entity_id     uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ex     public.extraction_results%rowtype;
  v_saved  jsonb;
  v_total  integer;
  v_done   boolean;
  v_owned  boolean;
begin
  select * into v_ex from public.extraction_results
  where id = p_extraction_id for update;

  if v_ex.id is null or v_ex.user_id <> p_user_id then
    raise exception 'EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ex.status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;
  if v_ex.status <> 'pending_review' then
    raise exception 'NOT_PENDING_REVIEW' using errcode = 'P0001';
  end if;
  if p_entity_type not in ('transaction', 'bill', 'receivable', 'expected_income') then
    raise exception 'UNKNOWN_ENTITY_TYPE' using errcode = 'P0001';
  end if;

  -- The record must exist, belong to this user, and be the type it claims.
  -- Without this, any id could be written into document_links.
  v_owned := case p_entity_type
    when 'transaction' then exists (select 1 from public.transactions
                                    where id = p_entity_id and user_id = p_user_id)
    when 'bill' then exists (select 1 from public.bills
                             where id = p_entity_id and user_id = p_user_id)
    when 'receivable' then exists (select 1 from public.receivables
                                   where id = p_entity_id and user_id = p_user_id)
    else exists (select 1 from public.expected_income
                 where id = p_entity_id and user_id = p_user_id)
  end;
  if not v_owned then
    raise exception 'ENTITY_NOT_FOUND' using errcode = 'P0002';
  end if;

  v_total := coalesce(jsonb_array_length(v_ex.structured_data -> 'drafts'), 0);
  if p_draft_index < 0 or p_draft_index >= greatest(v_total, 1) then
    raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0001';
  end if;

  v_saved := coalesce(v_ex.corrected_data -> 'saved', '{}'::jsonb);
  if v_saved ? p_draft_index::text then
    raise exception 'DRAFT_ALREADY_SAVED' using errcode = 'P0001';
  end if;

  v_saved := v_saved || jsonb_build_object(
    p_draft_index::text, jsonb_build_object('type', p_entity_type, 'id', p_entity_id));
  -- An older extraction with no drafts array is one implicit draft.
  v_done := (select count(*) from jsonb_object_keys(v_saved)) >= greatest(v_total, 1);

  update public.extraction_results
  set corrected_data = coalesce(corrected_data, '{}'::jsonb)
                       || jsonb_build_object('saved', v_saved),
      status = case when v_done then 'confirmed' else status end,
      confirmed_at = case when v_done then now() else confirmed_at end
  where id = p_extraction_id;

  insert into public.document_links (user_id, document_id, entity_type, entity_id)
  values (p_user_id, v_ex.document_id, p_entity_type, p_entity_id)
  on conflict do nothing;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'extraction', p_extraction_id, 'extraction_draft_saved',
     jsonb_build_object('draft_index', p_draft_index, 'entity_type', p_entity_type,
                        'entity_id', p_entity_id, 'complete', v_done));

  return jsonb_build_object('saved', (select count(*) from jsonb_object_keys(v_saved)),
                            'total', greatest(v_total, 1), 'complete', v_done);
end;
$$;

revoke all on function public.confirm_extraction_draft from public, anon, authenticated;
grant execute on function public.confirm_extraction_draft to service_role;
