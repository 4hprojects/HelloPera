#!/usr/bin/env node
/**
 * Migration runner.
 *
 * Applies supabase/migrations/*.sql in filename order, tracking what has run in
 * a schema_migrations table. Each file runs inside a single transaction, so a
 * failure leaves nothing half-applied.
 *
 *   npm run db:migrate    apply pending migrations
 *   npm run db:status     show applied vs pending
 *   npm run db:verify     run supabase/VERIFY-RLS.sql
 *
 * Needs DATABASE_URL — the POOLER string from
 * Supabase Dashboard > Settings > Database > Connection string.
 * The direct db.<ref> host is IPv6-only and will not connect from most networks.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const MIGRATIONS_DIR = 'supabase/migrations';

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#') || !t.includes('=')) continue;
      const i = t.indexOf('=');
      const k = t.slice(0, i).trim();
      const v = t
        .slice(i + 1)
        .trim()
        .replace(/^["']|["']$/g, '');
      if (!(k in process.env)) process.env[k] = v;
    }
  }
}

function connectionString() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRE_URI;
  if (!url) {
    console.error(
      'DATABASE_URL is not set.\n\n' +
        'Add it to .env.local. Get it from:\n' +
        '  Supabase Dashboard > Settings > Database > Connection string > URI\n\n' +
        'Use the POOLER string (aws-N-<region>.pooler.supabase.com, port 6543 or 5432).\n' +
        'The direct db.<ref>.supabase.co host is IPv6-only and usually unreachable.',
    );
    process.exit(1);
  }
  if (/@db\.[a-z0-9]+\.supabase\.co/.test(url)) {
    console.error(
      'That is the DIRECT database host (db.<ref>.supabase.co), which is IPv6-only.\n' +
        'Use the pooler connection string instead — Settings > Database > Connection string.',
    );
    process.exit(1);
  }
  return url;
}

function psql(url, { file, sql, quiet = false }) {
  const args = ['-v', 'ON_ERROR_STOP=1', '--no-psqlrc', url];
  if (quiet) args.push('-tA');
  if (file) args.push('-f', file);
  if (sql) args.push('-c', sql);
  const r = spawnSync('psql', args, { encoding: 'utf8' });
  if (r.error) {
    console.error('psql not found. Install the postgresql client.');
    process.exit(1);
  }
  return r;
}

function ensureTracking(url) {
  // Revoke immediately: Supabase grants anon/authenticated ALL on new public
  // tables by default, which would hand an anonymous visitor TRUNCATE on
  // migration history.
  const r = psql(url, {
    sql: `create table if not exists public.schema_migrations (
            version text primary key,
            applied_at timestamptz not null default now()
          );
          alter table public.schema_migrations enable row level security;
          alter table public.schema_migrations force row level security;
          revoke all on public.schema_migrations from anon, authenticated;`,
  });
  if (r.status !== 0) {
    console.error('Could not connect.\n' + (r.stderr || '').trim());
    process.exit(1);
  }
}

function applied(url) {
  const existence = psql(url, {
    sql: "select to_regclass('public.schema_migrations') is not null",
    quiet: true,
  });
  if (existence.status !== 0)
    throw new Error('Could not read migration tracking status.');
  if (existence.stdout.trim() !== 't') return new Set();
  const r = psql(url, {
    sql: 'select version from public.schema_migrations',
    quiet: true,
  });
  if (r.status !== 0) throw new Error('Could not read applied migrations.');
  return new Set(
    (r.stdout || '')
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function pending(url) {
  const done = applied(url);
  const all = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  return { all, done, todo: all.filter((f) => !done.has(f)) };
}

const command = process.argv[2] ?? 'migrate';
loadEnv();
const url = connectionString();

if (command === 'status') {
  const { all, done } = pending(url);
  for (const f of all) console.log(`  ${done.has(f) ? '✓ applied' : '· pending'}  ${f}`);
  if (all.length === 0) console.log('  no migrations found');
  process.exit(0);
}

if (command === 'verify') {
  const r = psql(url, { file: 'supabase/VERIFY-RLS.sql' });
  process.stdout.write(r.stdout ?? '');
  if (r.status !== 0) process.stderr.write(r.stderr ?? '');
  process.exit(r.status ?? 1);
}

if (command === 'migrate') {
  ensureTracking(url);
  const { todo } = pending(url);
  if (todo.length === 0) {
    console.log('Nothing to apply — database is up to date.');
    process.exit(0);
  }
  for (const file of todo) {
    process.stdout.write(`applying ${file} ... `);
    // single-transaction: a failure rolls the whole file back rather than
    // leaving the schema half-migrated.
    const r = spawnSync(
      'psql',
      [
        '-v',
        'ON_ERROR_STOP=1',
        '--no-psqlrc',
        '--single-transaction',
        '-f',
        join(MIGRATIONS_DIR, file),
        url,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0) {
      console.log('FAILED');
      console.error((r.stderr || '').trim());
      console.error('\nNothing from this file was applied. Fix and re-run.');
      process.exit(1);
    }
    psql(url, {
      sql: `insert into public.schema_migrations (version) values ('${file}')
            on conflict do nothing`,
    });
    console.log('ok');
  }
  console.log(`\nApplied ${todo.length} migration(s). Run: npm run db:verify`);
  process.exit(0);
}

console.error(`Unknown command "${command}". Use migrate | status | verify.`);
process.exit(1);
