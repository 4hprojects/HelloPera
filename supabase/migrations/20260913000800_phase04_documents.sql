-- =============================================================================
-- Phase 04 — Documents and Image Processing
--
-- Files live in a PRIVATE Supabase Storage bucket. Metadata lives here.
-- HelloDeploy's filesystem is never the system of record (§5) — containers are
-- replaced on every deploy.
--
-- ACCESS MODEL
--   The bucket has no policies for anon or authenticated at all. Every read
--   goes through a short-lived signed URL minted server-side after an
--   ownership check; every write goes through the upload action using the
--   service role. Storage RLS would otherwise have to re-derive ownership from
--   the object path, and a path-parsing mistake there is a cross-user file
--   leak.
--
-- RETENTION (§26)
--   The OCR-quality source survives until the extraction is resolved, not
--   until OCR merely completes — Phase 05 retries need it, and a display WebP
--   at 1800px/q85 is compressed for viewing, not for reading small print.
--
-- Idempotent.
-- =============================================================================

create table if not exists public.documents (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references auth.users (id) on delete cascade,
  document_type        text not null default 'other',

  -- Original, as received. Filename is metadata only — never a storage key.
  original_filename    text,
  original_mime_type   text,
  original_size_bytes  bigint,
  content_hash         text,

  storage_bucket       text not null default 'hello-pera-documents',
  original_path        text,
  display_path         text,
  thumbnail_path       text,

  display_mime_type    text,
  display_size_bytes   bigint,
  thumbnail_size_bytes bigint,
  width                integer,
  height               integer,
  page_count           integer,

  processing_status    text not null default 'uploaded',
  processing_error     text,
  retention_status     text not null default 'original_retained',

  is_archived          boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

comment on column public.documents.original_filename is
  'Display metadata only. Storage keys are generated UUIDs — a user-supplied filename in a path is a traversal waiting to happen.';
comment on column public.documents.retention_status is
  'original_retained until the Phase 05 extraction is confirmed or discarded. OCR retry needs the full-quality source.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_type_check') then
    alter table public.documents add constraint documents_type_check check (
      document_type in ('receipt','screenshot','bill','payment_confirmation','bank_record',
                        'ewallet_record','invoice','statement','salary_record','other'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_processing_check') then
    alter table public.documents add constraint documents_processing_check check (
      processing_status in ('uploaded','processing','ready','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'documents_retention_check') then
    alter table public.documents add constraint documents_retention_check check (
      retention_status in ('original_retained','original_temporary','original_deleted','optimized_only'));
  end if;
end $$;

create index if not exists documents_user_created_idx
  on public.documents (user_id, created_at desc);
create index if not exists documents_user_type_idx
  on public.documents (user_id, document_type);
-- Duplicate detection in Phase 05 looks up by hash within a user.
create index if not exists documents_user_hash_idx
  on public.documents (user_id, content_hash) where content_hash is not null;
create index if not exists documents_failed_idx
  on public.documents (user_id) where processing_status = 'failed';

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- document_links (§41)
--
-- Created now rather than in Phase 05: the many-to-many shape is what allows
-- one receipt to evidence several records, and one record to have several
-- documents. Retrofitting it after documents exist means a migration plus a
-- backfill.
-- -----------------------------------------------------------------------------

create table if not exists public.document_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  document_id uuid not null references public.documents (id) on delete cascade,
  entity_type text not null,
  entity_id   uuid not null,
  created_at  timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'document_links_entity_check') then
    alter table public.document_links add constraint document_links_entity_check check (
      entity_type in ('transaction','bill','receivable','expected_income'));
  end if;
end $$;

create unique index if not exists document_links_unique_idx
  on public.document_links (document_id, entity_type, entity_id);
create index if not exists document_links_entity_idx
  on public.document_links (entity_type, entity_id);

-- -----------------------------------------------------------------------------
-- Storage bucket
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'hello-pera-documents',
  'hello-pera-documents',
  false,                              -- never public: these are bank records
  8388608,                            -- 8 MB. HelloDeploy's nginx caps requests
                                      -- at 10 MB; 8 leaves room for multipart
                                      -- overhead. See PLATFORM-HELLODEPLOY.md Q1.
  array['image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- No policies on storage.objects for anon or authenticated.
-- Reads use server-minted signed URLs; writes use the service role.
drop policy if exists "hellopera documents are private" on storage.objects;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------

alter table public.documents      enable row level security;
alter table public.documents      force  row level security;
alter table public.document_links enable row level security;
alter table public.document_links force  row level security;

drop policy if exists documents_select_own on public.documents;
create policy documents_select_own on public.documents
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists document_links_select_own on public.document_links;
create policy document_links_select_own on public.document_links
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.documents, public.document_links from anon, authenticated;
grant select on public.documents, public.document_links to authenticated;
