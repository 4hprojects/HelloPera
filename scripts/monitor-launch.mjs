import { createClient } from '@supabase/supabase-js';
const required = ['MONITOR_APP_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SECRET_KEY'];
for (const key of required)
  if (!process.env[key]) throw new Error(`Monitoring not configured: ${key}`);
const failures = [];
try {
  const response = await fetch(`${process.env.MONITOR_APP_URL}/api/health/ready`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok || (await response.json()).status !== 'ready')
    failures.push('Application readiness');
} catch {
  failures.push('Application unreachable');
}
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
);
const since = new Date(Date.now() - 15 * 60_000).toISOString();
const { data: findings, error: integrityError } = await admin.rpc(
  'check_financial_integrity',
);
if (integrityError || findings?.length) failures.push('Financial integrity');
const { count, error: jobError } = await admin
  .from('job_runs')
  .select('id', { count: 'exact', head: true })
  .eq('status', 'failed')
  .gte('started_at', since);
if (jobError || count) failures.push('Background job failures');
const { data: jobs, error: historyError } = await admin
  .from('job_runs')
  .select('job_type,started_at')
  .eq('status', 'succeeded')
  .gte('started_at', new Date(Date.now() - 2 * 60 * 60_000).toISOString());
if (
  historyError ||
  !jobs?.some((j) => j.job_type === 'recurring_generation') ||
  !jobs?.some((j) => j.job_type === 'notification_generation')
)
  failures.push('Hourly scheduler freshness');
// Logs/HTTP error-rate alerts additionally require the hosting platform's log sink.
if (failures.length) {
  console.error(
    `Operator action required: ${failures.join(', ')}. Inspect /admin/system and /admin/integrity.`,
  );
  process.exitCode = 1;
} else console.log('Readiness, financial integrity, and background jobs are healthy.');
