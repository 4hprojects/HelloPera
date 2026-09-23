-- Provider-backed features stay dark until credentials and delivery have been
-- verified in a production-like environment. The application now consults
-- both switches, so these rows are operational kill switches rather than
-- descriptive metadata.

update public.feature_flags
set enabled = false,
    config = config || '{"requires_provider_configuration": true}'::jsonb,
    updated_at = now()
where key in ('ocr_enabled', 'push_enabled');
