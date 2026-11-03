-- HP-038: a document whose shrink failed is skipped for a while.
--
-- The storage sweep picks the 20 oldest unshrunk images each run. A file that
-- cannot be shrunk (corrupt, or an unsupported variant) failed every run and
-- stayed in that oldest 20, so 20 such files stopped the sweep for good. A
-- failure now stamps shrink_failed_at, and the sweep skips the document until
-- the stamp is a week old.

alter table public.documents add column if not exists shrink_failed_at timestamptz;
