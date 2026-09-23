/** Read-only comparison after restoring a backup into a separate project. */
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
for (const key of [
  'RESTORE_SOURCE_URL',
  'RESTORE_SOURCE_SECRET',
  'RESTORE_TARGET_URL',
  'RESTORE_TARGET_SECRET',
])
  if (!process.env[key]) throw new Error(`NOT VERIFIED: ${key} is required`);
assert.notEqual(
  new URL(process.env.RESTORE_SOURCE_URL).hostname,
  new URL(process.env.RESTORE_TARGET_URL).hostname,
  'Restore target must be a different project',
);
const source = createClient(
  process.env.RESTORE_SOURCE_URL,
  process.env.RESTORE_SOURCE_SECRET,
);
const target = createClient(
  process.env.RESTORE_TARGET_URL,
  process.env.RESTORE_TARGET_SECRET,
);
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function rows(client, table, ordering = ['id']) {
  const digest = createHash('sha256');
  let count = 0;
  for (let offset = 0; ; offset += 500) {
    let query = client.from(table).select('*');
    for (const column of ordering) query = query.order(column);
    const { data, error } = await query.range(offset, offset + 499);
    if (error) throw new Error(`Could not compare ${table}`);
    for (const row of data)
      digest.update(
        JSON.stringify(
          Object.fromEntries(Object.entries(row).sort(([a], [b]) => a.localeCompare(b))),
        ),
      );
    count += data.length;
    if (data.length < 500) return { count, hash: digest.digest('hex') };
  }
}
for (const table of [
  'profiles',
  'accounts',
  'transactions',
  'bills',
  'receivables',
  'expected_income',
  'bill_payments',
  'receivable_payments',
  'expected_income_receipts',
  'recurring_rules',
  'expected_events',
  'documents',
]) {
  const [a, b] = await Promise.all([rows(source, table), rows(target, table)]);
  assert.deepEqual(
    b,
    a,
    `Restored ${table} differs; compare against the frozen backup source.`,
  );
  console.log(`PASS ${table}: ${a.count} rows match`);
}
for (const [table, ordering] of [
  ['payment_requests', ['user_id', 'request_id']],
  ['account_deletions', ['user_id']],
  ['deletion_challenges', ['token_hash']],
]) {
  const [a, b] = await Promise.all([
    rows(source, table, ordering),
    rows(target, table, ordering),
  ]);
  assert.deepEqual(b, a, `Restored ${table} differs`);
  console.log(`PASS ${table}: ${a.count} rows match`);
}
async function objects(client) {
  const queue = [''];
  const paths = [];
  for (let i = 0; i < queue.length; i++)
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await client.storage
        .from('hello-pera-documents')
        .list(queue[i], { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } });
      if (error) throw new Error('Storage listing failed');
      for (const entry of data) {
        const path = queue[i] ? `${queue[i]}/${entry.name}` : entry.name;
        if (entry.id === null) queue.push(path);
        else paths.push(path);
      }
      if (data.length < 100) break;
    }
  return paths.sort();
}
const [sourcePaths, targetPaths] = await Promise.all([objects(source), objects(target)]);
assert.equal(
  hash(JSON.stringify(targetPaths)),
  hash(JSON.stringify(sourcePaths)),
  'Restored file inventory differs',
);
for (const path of sourcePaths) {
  const blobs = await Promise.all(
    [source, target].map(async (client) => {
      const { data, error } = await client.storage
        .from('hello-pera-documents')
        .download(path);
      if (error) throw new Error('Restored file could not be read');
      return hash(Buffer.from(await data.arrayBuffer()));
    }),
  );
  assert.equal(blobs[0], blobs[1], 'Restored file bytes differ');
}
console.log(`PASS storage: ${sourcePaths.length} files match by SHA-256`);
console.log(
  'Record this result with backup timestamp, restoration duration, and separate auth/RLS verification.',
);
