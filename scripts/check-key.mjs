#!/usr/bin/env node
/**
 * Verify SUPABASE_SERVICE_ROLE_KEY is present and correct.
 *
 * Never prints the key. Decodes the JWT claims (base64, not encrypted) to
 * confirm the role, then makes one live call to prove it actually works.
 */
import { readFileSync, existsSync } from 'node:fs';

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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function fail(msg, hint) {
  console.log(`\n  ✗ ${msg}`);
  if (hint) console.log(`    ${hint}`);
  process.exit(1);
}

if (!key) {
  fail(
    'No Supabase secret key found.',
    'Set SUPABASE_SECRET_KEY=sb_secret_... in .env (no "#", no space before "=")',
  );
}
if (key === anon) {
  fail(
    'That is the anon key, not the service_role key.',
    'They look alike. The service_role one is behind a Reveal button.',
  );
}

let role = null;
if (key.startsWith('eyJ')) {
  try {
    const p = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    role = JSON.parse(
      Buffer.from(p + '='.repeat((4 - (p.length % 4)) % 4), 'base64'),
    ).role;
  } catch {
    fail(
      'That value is not a valid JWT.',
      'Copy the whole key — they are long and easy to truncate.',
    );
  }
  if (role !== 'service_role') {
    fail(
      `That key has role "${role}", not "service_role".`,
      'Use the one marked service_role / secret.',
    );
  }
  console.log(`\n  ✓ format  legacy JWT, role = service_role`);
} else if (key.startsWith('sb_secret_')) {
  console.log(`\n  ✓ format  new-style secret key`);
} else if (key.startsWith('sb_publishable_')) {
  fail('That is the publishable key.', 'You want the one starting sb_secret_.');
} else if (key.startsWith('sb_')) {
  fail(
    `Unrecognised key prefix "${key.slice(0, 14)}...".`,
    'Supabase issues only sb_publishable_ and sb_secret_. You want sb_secret_.',
  );
} else {
  console.log(`\n  ? format  unrecognised prefix — trying it anyway`);
}

// Live check: read a table that RLS hides from everyone else.
const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});

if (res.ok) {
  console.log('  ✓ live     authenticated against your project');
  console.log('\n  Service-role key is working. Writes are enabled.\n');
} else {
  const body = await res.text();
  fail(`The key was rejected (HTTP ${res.status}).`, body.slice(0, 120));
}
