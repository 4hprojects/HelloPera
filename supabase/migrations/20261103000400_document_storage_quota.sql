-- HP-031: the bytes a user holds in document storage, for the upload quota.
--
-- Counted from storage.objects rather than the documents table, so it includes
-- staged uploads under incoming/<uid>/ that were never finalised, and the
-- shrunk original rather than the size recorded at upload. Storage keeps the
-- object size in metadata->>'size'. Paths are <uid>/... for stored renditions
-- and incoming/<uid>/... while staged, and `name` is collated "C" in
-- Supabase, so both prefix matches use the (bucket_id, name) index.

create or replace function public.user_storage_bytes(p_user_id uuid)
returns bigint language sql stable security definer set search_path = '' as $$
  select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint
  from storage.objects o
  where o.bucket_id = 'hello-pera-documents'
    and (o.name like p_user_id::text || '/%'
      or o.name like 'incoming/' || p_user_id::text || '/%');
$$;

revoke all on function public.user_storage_bytes from public, anon, authenticated;
grant execute on function public.user_storage_bytes to service_role;
