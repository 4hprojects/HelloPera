-- Saving one draft of a multi-record extraction.
--
-- A document can now propose several records, created through different
-- services, so they cannot share one database transaction. Instead each draft
-- is saved on its own, and this function is what makes that safe:
--   * it locks the extraction row, so two concurrent saves of the same draft
--     cannot both pass the check;
--   * a draft index is accepted once (DRAFT_ALREADY_SAVED on a repeat), so a
--     double-click or retry never records the same draft twice;
--   * the document is linked to each record it produced;
--   * the extraction becomes `confirmed` only when every draft is saved, and
--     stays `pending_review` while some remain.
-- Saved drafts are kept in `corrected_data.saved` as { "<index>": { type, id } }.

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
