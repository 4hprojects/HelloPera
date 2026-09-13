-- =============================================================================
-- Phase 05 — OCR and Financial Extraction
--
-- CORE PRINCIPLE (§4): OCR is not authoritative.
--
--   Document -> OCR -> Extraction -> User Review -> Confirmation -> Record
--
-- Nothing derived from a document may change a balance before a human confirms
-- it. That is enforced structurally: extraction rows hold JSON, never money,
-- and the only path to a transaction is confirm_extraction() below, which
-- requires the extraction to be in pending_review.
--
-- Idempotent.
-- =============================================================================

create table if not exists public.ocr_jobs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  document_id        uuid not null references public.documents (id) on delete cascade,
  provider           text not null,
  status             text not null default 'queued',
  attempt_count      integer not null default 0,
  started_at         timestamptz,
  completed_at       timestamptz,
  failed_at          timestamptz,
  error_code         text,
  error_message_safe text,
  duration_ms        integer,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- One active job per document (§45). Prevents a double-click from paying a
-- provider twice for the same page.
create unique index if not exists ocr_jobs_one_active_idx
  on public.ocr_jobs (document_id)
  where status in ('queued', 'processing');

create index if not exists ocr_jobs_user_idx on public.ocr_jobs (user_id, created_at desc);
create index if not exists ocr_jobs_failed_idx
  on public.ocr_jobs (user_id) where status = 'failed';

create table if not exists public.ocr_results (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users (id) on delete cascade,
  document_id        uuid not null references public.documents (id) on delete cascade,
  ocr_job_id         uuid references public.ocr_jobs (id) on delete set null,
  provider           text not null,
  raw_text           text,
  overall_confidence numeric(4, 3),
  provider_metadata  jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);

comment on column public.ocr_results.raw_text is
  'Document text. Never written to application logs (§58) — it contains account numbers and balances.';

create index if not exists ocr_results_document_idx on public.ocr_results (document_id);

create table if not exists public.extraction_results (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  document_id       uuid not null references public.documents (id) on delete cascade,
  ocr_result_id     uuid references public.ocr_results (id) on delete set null,
  document_type     text,
  target_type       text,
  status            text not null default 'pending_review',
  -- Structured fields stay as JSON until a human confirms. Deliberately not
  -- numeric columns: an extraction is a proposal, and giving it the shape of a
  -- financial record invites something to read it as one.
  structured_data   jsonb not null default '{}'::jsonb,
  field_confidence  jsonb not null default '{}'::jsonb,
  validation_errors jsonb not null default '[]'::jsonb,
  corrected_data    jsonb,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname='ocr_jobs_status_check') then
    alter table public.ocr_jobs add constraint ocr_jobs_status_check
      check (status in ('queued','processing','completed','failed','cancelled'));
  end if;
  if not exists (select 1 from pg_constraint where conname='extraction_status_check') then
    alter table public.extraction_results add constraint extraction_status_check
      check (status in ('pending_review','confirmed','discarded','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname='extraction_target_check') then
    alter table public.extraction_results add constraint extraction_target_check
      check (target_type is null or target_type in
        ('transaction','bill','receivable','expected_income','unknown'));
  end if;
end $$;

create index if not exists extraction_document_idx on public.extraction_results (document_id);
create index if not exists extraction_pending_idx
  on public.extraction_results (user_id, created_at desc) where status = 'pending_review';

drop trigger if exists ocr_jobs_set_updated_at on public.ocr_jobs;
create trigger ocr_jobs_set_updated_at before update on public.ocr_jobs
  for each row execute function public.set_updated_at();
drop trigger if exists extraction_set_updated_at on public.extraction_results;
create trigger extraction_set_updated_at before update on public.extraction_results
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Confirmation (§33, §83)
--
-- The ONLY path from an extraction to a financial record.
--
-- Idempotent by status transition: the row must be pending_review, and the
-- update to 'confirmed' happens in the same transaction as the record creation.
-- A double-click therefore cannot create two transactions — the second call
-- finds the row already confirmed and stops.
-- -----------------------------------------------------------------------------

create or replace function public.confirm_extraction(
  p_user_id       uuid,
  p_extraction_id uuid,
  p_entity_type   text,
  p_entity_id     uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner       uuid;
  v_status      text;
  v_document_id uuid;
begin
  -- Lock first: two simultaneous confirms must not both see pending_review.
  select user_id, status, document_id
    into v_owner, v_status, v_document_id
  from public.extraction_results
  where id = p_extraction_id
  for update;

  if v_owner is null or v_owner <> p_user_id then
    raise exception 'EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status = 'confirmed' then
    raise exception 'ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;
  if v_status <> 'pending_review' then
    raise exception 'NOT_PENDING_REVIEW' using errcode = 'P0001';
  end if;

  update public.extraction_results
  set status = 'confirmed', target_type = p_entity_type, confirmed_at = now()
  where id = p_extraction_id;

  -- Link the document to whatever the confirmation created, so the receipt is
  -- reachable from the record and vice versa.
  insert into public.document_links (user_id, document_id, entity_type, entity_id)
  values (p_user_id, v_document_id, p_entity_type, p_entity_id)
  on conflict do nothing;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type, after_data)
  values
    (p_user_id, p_user_id, 'extraction', p_extraction_id, 'extraction_confirmed',
     jsonb_build_object('entity_type', p_entity_type, 'entity_id', p_entity_id));
end;
$$;

create or replace function public.discard_extraction(
  p_user_id uuid,
  p_extraction_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_owner uuid; v_status text;
begin
  select user_id, status into v_owner, v_status
  from public.extraction_results where id = p_extraction_id for update;

  if v_owner is null or v_owner <> p_user_id then
    raise exception 'EXTRACTION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status = 'confirmed' then
    -- Discarding after confirmation would orphan a real financial record.
    raise exception 'ALREADY_CONFIRMED' using errcode = 'P0001';
  end if;

  update public.extraction_results set status = 'discarded' where id = p_extraction_id;

  insert into public.audit_logs
    (actor_user_id, target_user_id, entity_type, entity_id, event_type)
  values (p_user_id, p_user_id, 'extraction', p_extraction_id, 'extraction_discarded');
end;
$$;

revoke all on function public.confirm_extraction from anon, authenticated;
revoke all on function public.discard_extraction from anon, authenticated;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array['ocr_jobs','ocr_results','extraction_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_select_own', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (user_id = (select auth.uid()))',
      t||'_select_own', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;
