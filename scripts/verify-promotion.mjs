import { assertPromotion } from './release-contracts.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { GH_TOKEN, GITHUB_REPOSITORY, RELEASE_SHA, STAGING_RUN_ID } = process.env;
if (!/^\d+$/.test(STAGING_RUN_ID || '') || !/^[a-f0-9]{40}$/.test(RELEASE_SHA || ''))
  throw new Error('Valid staging run ID and full SHA required.');
const response = await fetch(
  `https://api.github.com/repos/${GITHUB_REPOSITORY}/actions/runs/${STAGING_RUN_ID}`,
  {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
    },
    signal: AbortSignal.timeout(15000),
  },
);
if (!response.ok) throw new Error('Could not verify staging run.');
const run = await response.json();
const evidence = JSON.parse(await readFile('promotion-evidence/release.json', 'utf8'));
assertPromotion(run, evidence, RELEASE_SHA, STAGING_RUN_ID);
if (process.argv.includes('--migrations'))
  for (const name of await readdir('supabase/migrations'))
    if (
      name.endsWith('.sql') &&
      evidence.migrations[name] !==
        createHash('sha256')
          .update(await readFile(`supabase/migrations/${name}`))
          .digest('hex')
    )
      throw new Error('Migration content differs from staging.');
console.log('Verified successful staging evidence for requested production SHA.');
