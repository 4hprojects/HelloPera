import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
for (const file of ['.env.local', '.env'])
  if (existsSync(file)) process.loadEnvFile(file);
const required = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'TEST_SUPABASE_PROJECT_REF',
];
if (process.argv[2] === 'browser') required.push('E2E_BASE_URL');
for (const key of required)
  if (!process.env[key])
    throw new Error(`NOT VERIFIED: ${key} is required for isolated staging tests.`);
const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (host !== `${process.env.TEST_SUPABASE_PROJECT_REF}.supabase.co`)
  throw new Error('Test project identity does not match the configured Supabase URL.');
const browser = process.argv[2] === 'browser';
const result = spawnSync(
  process.execPath,
  browser
    ? [
        'node_modules/@playwright/test/cli.js',
        'test',
        ...(process.env.HELLOPERA_PERF_PROFILE
          ? ['performance.spec.ts', '--project=desktop']
          : ['public.spec.ts', 'finance.spec.ts']),
      ]
    : ['node_modules/vitest/vitest.mjs', 'run', '--includeTaskLocation'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      HELLOPERA_INTEGRATION: '1',
      HELLOPERA_E2E_STAGING: browser ? '1' : '0',
      HELLOPERA_ONLY_INTEGRATION: '1',
    },
  },
);
process.exitCode = result.status ?? 1;
