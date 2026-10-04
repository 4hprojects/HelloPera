-- HP-013: exact admin totals computed in the database. REST reads are capped at
-- 1,000 rows, so counting rows client-side under-reports silently. Service-role
-- only; operational fields only (no titles, messages, prompts or amounts).

create or replace function public.admin_overview_counts(
  p_since timestamptz, p_jobs_since timestamptz
) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'users_total',(select count(*) from public.profiles),
    'users_active',(select count(*) from public.profiles where status='active'),
    'users_suspended',(select count(*) from public.profiles where status='suspended'),
    'users_disabled',(select count(*) from public.profiles where status='disabled'),
    'admins',(select count(*) from public.profiles where role='admin'),
    'ocr_today',(select count(*) from public.ocr_jobs where created_at>=p_since),
    'ocr_failed',(select count(*) from public.ocr_jobs where created_at>=p_since and status='failed'),
    'ai_today',(select count(*) from public.ai_usage_logs where created_at>=p_since),
    'ai_failed',(select count(*) from public.ai_usage_logs where created_at>=p_since and status<>'succeeded'),
    'notifications_pending',(select count(*) from public.notifications where delivery_status='pending'),
    'notifications_failed',(select count(*) from public.notifications where delivery_status='failed'),
    'jobs_last_run_at',(select max(started_at) from public.job_runs),
    'jobs_failed',(select count(*) from public.job_runs where started_at>=p_jobs_since and status='failed')
  );
$$;

create or replace function public.admin_ai_aggregates(p_since timestamptz)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'total',(select count(*) from public.ai_usage_logs where created_at>=p_since),
    'failed',(select count(*) from public.ai_usage_logs where created_at>=p_since and status<>'succeeded'),
    'median_duration_ms',(select percentile_disc(0.5) within group (order by duration_ms)
       from public.ai_usage_logs where created_at>=p_since and duration_ms>0),
    'by_intent',coalesce((select jsonb_agg(jsonb_build_object('value',v,'count',n) order by n desc)
       from (select intent v, count(*) n from public.ai_usage_logs
             where created_at>=p_since and intent is not null group by intent) g),'[]'::jsonb),
    'by_call_type',coalesce((select jsonb_agg(jsonb_build_object('value',v,'count',n) order by n desc)
       from (select coalesce(call_type,'unknown') v, count(*) n from public.ai_usage_logs
             where created_at>=p_since group by 1) g),'[]'::jsonb)
  );
$$;

create or replace function public.admin_notification_aggregates()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'by_delivery_status',coalesce((select jsonb_agg(jsonb_build_object('value',v,'count',n) order by n desc)
       from (select coalesce(delivery_status,'unknown') v, count(*) n from public.notifications group by 1) g),'[]'::jsonb),
    'by_type',coalesce((select jsonb_agg(jsonb_build_object('value',v,'count',n) order by n desc)
       from (select coalesce(type,'unknown') v, count(*) n from public.notifications group by 1) g),'[]'::jsonb),
    'by_channel',coalesce((select jsonb_agg(jsonb_build_object('value',v,'count',n) order by n desc)
       from (select coalesce(channel,'unknown') v, count(*) n from public.notifications group by 1) g),'[]'::jsonb),
    'push_active',(select count(*) from public.push_subscriptions where is_active),
    'push_failing',(select count(*) from public.push_subscriptions where failure_count>0)
  );
$$;

revoke all on function public.admin_overview_counts(timestamptz,timestamptz) from public,anon,authenticated;
revoke all on function public.admin_ai_aggregates(timestamptz) from public,anon,authenticated;
revoke all on function public.admin_notification_aggregates() from public,anon,authenticated;
grant execute on function public.admin_overview_counts(timestamptz,timestamptz) to service_role;
grant execute on function public.admin_ai_aggregates(timestamptz) to service_role;
grant execute on function public.admin_notification_aggregates() to service_role;
