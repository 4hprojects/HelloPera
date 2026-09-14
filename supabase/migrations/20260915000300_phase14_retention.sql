-- =============================================================================
-- Phase 14 — retention cleanup, built and switched off
--
-- §73: "Define actual retention for: documents, OCR raw text, AI
-- conversations, notifications, logs, audit records, deleted accounts. **Policy
-- must match Privacy page.**"
--
-- No policy exists yet, and PHASE-12 §19 already says retention must not be
-- destructive without one. So these functions are written, tested and
-- **disabled**: every one of them refuses to run unless `retention_enabled` is
-- on, and that flag ships off.
--
-- Periods are parameters with conservative defaults rather than decisions.
-- Inventing a number here would put the application in contradiction with the
-- published privacy page, which is worse than deleting nothing — the page is a
-- promise, and this is the code that would break it.
--
-- ## What each one would delete
--
-- Recorded here so the decision can be made against the privacy page rather
-- than in the abstract, and repeated in LAUNCH-CHECKLIST.md §15.
--
--   expired_notifications   notifications past `expires_at`. Least sensitive:
--                           they are derived from bills and balances that
--                           still exist.
--   ocr_text                `ocr_results.raw_text` only. The extracted FIELDS
--                           and the document survive — this drops the verbatim
--                           transcription, which is the most sensitive artefact
--                           OCR produces and the least useful to keep.
--   inactive_push           subscriptions that have failed repeatedly. Not user
--                           data in any meaningful sense; a dead device.
--
-- Documents themselves are deliberately NOT here. `document_retention_days` is
-- an entitlement users are sold on, so expiring their receipts is a product
-- decision, not an operational one.
--
-- Idempotent.
-- =============================================================================

create or replace function public.retention_is_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select enabled from public.feature_flags where key = 'retention_enabled'), false)
$$;

comment on function public.retention_is_enabled() is
  'PHASE-14 section 73. Ships false. Every retention job checks this first.';

-- -----------------------------------------------------------------------------
-- run_retention_cleanup (§74, §75, §76, §77)
--
-- One function rather than three, so there is one place the flag is checked and
-- one `job_runs` row to read. Each step reports what it removed; a step that
-- removes nothing is normal, not an error.
--
-- Lock taken, held and released in this one call — a begin/finish split leaks
-- it under Supavisor, where the next statement may land on another session.
-- -----------------------------------------------------------------------------

create or replace function public.run_retention_cleanup(
  p_notification_days integer default 30,
  p_ocr_text_days     integer default 365,
  p_push_failures     integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_job_type text := 'retention_cleanup';
  v_job_id   uuid;
  v_started  timestamptz := clock_timestamp();
  v_notifications integer := 0;
  v_ocr_text      integer := 0;
  v_push          integer := 0;
  v_n             integer;
begin
  -- The switch, before anything else. A disabled job is not a failure: it
  -- returns and says so, and the scheduler can keep firing harmlessly until
  -- someone decides the policy.
  if not public.retention_is_enabled() then
    return jsonb_build_object('skipped', true, 'reason', 'retention_disabled');
  end if;

  if not pg_try_advisory_lock(hashtext(v_job_type)) then
    return jsonb_build_object('skipped', true, 'reason', 'locked');
  end if;

  insert into public.job_runs (job_type, status)
  values (v_job_type, 'running')
  returning id into v_job_id;

  begin
    -- 1. Notifications past their own expiry, plus a grace period.
    delete from public.notifications
    where expires_at is not null
      and expires_at < now() - make_interval(days => p_notification_days);
    get diagnostics v_n = row_count;
    v_notifications := v_n;

    -- 2. The verbatim OCR transcription, nulled rather than deleted: the row
    --    records that a document was read, when, and by which provider, and
    --    losing that would make the job history unreadable. It is the TEXT that
    --    is sensitive.
    update public.ocr_results
    set raw_text = null
    where raw_text is not null
      and created_at < now() - make_interval(days => p_ocr_text_days);
    get diagnostics v_n = row_count;
    v_ocr_text := v_n;

    -- 3. Push subscriptions that have failed enough times to be dead devices.
    delete from public.push_subscriptions
    where failure_count >= p_push_failures
      and is_active = false;
    get diagnostics v_n = row_count;
    v_push := v_n;

    update public.job_runs
    set status       = 'succeeded',
        completed_at = now(),
        duration_ms  = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
        metadata     = jsonb_build_object(
                         'notifications_deleted', v_notifications,
                         'ocr_text_cleared',      v_ocr_text,
                         'push_subscriptions_deleted', v_push
                       )
    where id = v_job_id;

  exception when others then
    update public.job_runs
    set status       = 'failed',
        completed_at = now(),
        duration_ms  = (extract(epoch from (clock_timestamp() - v_started)) * 1000)::integer,
        error_code   = sqlstate,
        metadata     = jsonb_build_object('error', left(sqlerrm, 500))
    where id = v_job_id;

    perform pg_advisory_unlock(hashtext(v_job_type));
    raise;
  end;

  perform pg_advisory_unlock(hashtext(v_job_type));

  return jsonb_build_object(
    'notifications_deleted',      v_notifications,
    'ocr_text_cleared',           v_ocr_text,
    'push_subscriptions_deleted', v_push
  );
end;
$$;

-- PUBLIC holds EXECUTE by default; revoking from anon/authenticated is a no-op.
revoke all on function public.retention_is_enabled() from public;
revoke all on function public.run_retention_cleanup(integer, integer, integer) from public;
grant execute on function public.retention_is_enabled() to service_role;
grant execute on function public.run_retention_cleanup(integer, integer, integer) to service_role;

-- -----------------------------------------------------------------------------
-- Schedule — the job runs daily and does nothing until the flag is on.
--
-- Scheduling a disabled job is deliberate: it means turning retention on is one
-- flag in the admin UI rather than a migration, and the schedule has already
-- been exercised by then.
-- -----------------------------------------------------------------------------

do $$
begin
  create extension if not exists pg_cron;

  if exists (select 1 from cron.job where jobname = 'retention_cleanup') then
    perform cron.unschedule('retention_cleanup');
  end if;

  perform cron.schedule(
    'retention_cleanup',
    '50 4 * * *',
    $cron$ select public.run_retention_cleanup() $cron$
  );

  raise notice 'pg_cron: retention_cleanup scheduled daily (disabled until retention_enabled is on)';
exception when others then
  raise warning 'pg_cron unavailable (%): retention cleanup will not run automatically.', sqlerrm;
end $$;
