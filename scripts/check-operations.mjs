#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const index = trimmed.indexOf('=');
      const key = trimmed.slice(0, index).trim();
      const value = trimmed
        .slice(index + 1)
        .trim()
        .replace(/^['"]|['"]$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  }
}

function query(sql) {
  const result = spawnSync(
    'psql',
    ['--no-psqlrc', '-v', 'ON_ERROR_STOP=1', '-tA', process.env.DATABASE_URL, '-c', sql],
    { encoding: 'utf8' },
  );
  if (result.error) throw new Error('psql is required for operational checks.');
  if (result.status !== 0) {
    throw new Error((result.stderr || 'Operational database query failed.').trim());
  }
  return result.stdout.trim();
}

const results = [];
const pass = (name, detail) => results.push({ state: 'PASS', name, detail });
const fail = (name, detail) => results.push({ state: 'FAIL', name, detail });
const manual = (name, detail) => results.push({ state: 'MANUAL', name, detail });

loadEnv();

if (!process.env.DATABASE_URL) {
  fail('Database connection', 'DATABASE_URL is missing.');
} else {
  const cronInstalled = query(
    "select exists(select 1 from pg_extension where extname = 'pg_cron')",
  );
  if (cronInstalled === 't') {
    pass('pg_cron', 'Extension is installed.');
    const jobs = new Set(
      query('select jobname from cron.job where active order by jobname')
        .split('\n')
        .filter(Boolean),
    );
    const expected = [
      'financial_integrity_check',
      'notification_cleanup',
      'notification_generation',
      'rate_limit_cleanup',
      'recurring_generation',
      'retention_cleanup',
    ];
    const missing = expected.filter((job) => !jobs.has(job));
    if (missing.length === 0)
      pass('Scheduled jobs', `${expected.length} expected jobs active.`);
    else fail('Scheduled jobs', `Missing active jobs: ${missing.join(', ')}`);
  } else {
    fail(
      'pg_cron',
      'Unavailable. Configure and document an external scheduler fallback.',
    );
  }

  const adminCount = Number(
    query(
      "select count(*) from public.profiles where role = 'admin' and status = 'active'",
    ),
  );
  if (adminCount > 0) pass('Admin access', `${adminCount} active admin account(s).`);
  else fail('Admin access', 'No active administrator exists.');

  const flags = JSON.parse(
    query(
      "select coalesce(jsonb_object_agg(key, enabled), '{}'::jsonb)::text from public.feature_flags",
    ),
  );
  if (process.env.RELEASE_ENVIRONMENT) {
    const deferred = [
      'push_enabled',
      'ocr_enabled',
      'ai_enabled',
      'billing_enabled',
      'premium_enabled',
      'ads_enabled_global',
    ];
    const enabled = deferred.filter((key) => flags[key] !== false);
    if (enabled.length)
      fail(
        'Free launch scope',
        `Deferred flags must remain disabled: ${enabled.join(', ')}`,
      );
    else pass('Free launch scope', 'All provider features are disabled.');
  }
  const pushConfigured = Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT &&
    process.env.SCHEDULER_SECRET,
  );
  if (pushConfigured || flags.push_enabled === false) {
    pass(
      'Push safety',
      pushConfigured
        ? 'Credentials and scheduler secret are present.'
        : 'Safely disabled.',
    );
  } else {
    fail(
      'Push safety',
      'push_enabled is on while VAPID or scheduler configuration is missing.',
    );
  }

  const aiConfigured = Boolean(
    process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN,
  );
  if (aiConfigured || (flags.ocr_enabled === false && flags.ai_enabled === false)) {
    pass(
      'AI/OCR safety',
      aiConfigured ? 'Provider credential is present.' : 'Safely disabled.',
    );
  } else {
    fail('AI/OCR safety', 'AI or OCR is enabled without a provider credential.');
  }

  if (flags.billing_enabled === false && flags.premium_enabled === false) {
    pass('Billing safety', 'Billing and Premium remain disabled.');
  } else {
    fail(
      'Billing safety',
      'Billing flags are on while the application still uses the no-op provider.',
    );
  }

  if (flags.ads_enabled_global === false)
    pass('Advertising safety', 'Advertising is disabled.');
  else
    fail(
      'Advertising safety',
      'Advertising is enabled; verify AdSense and consent first.',
    );
}

manual(
  'Backup restore',
  'Confirm a real backup was restored into a non-production project.',
);
manual('Production email', 'Confirm custom SMTP with a real signup and password reset.');

for (const result of results) {
  console.log(`${result.state.padEnd(6)} ${result.name}: ${result.detail}`);
}

const failures = results.filter((result) => result.state === 'FAIL').length;
if (failures > 0) {
  console.error(`\nOperational readiness failed: ${failures} automated check(s).`);
  process.exitCode = 1;
} else {
  console.log('\nAutomated operational checks passed. MANUAL items still block launch.');
}
