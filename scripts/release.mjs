import { assertDeploymentIdentity } from './release-contracts.mjs';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const required = (key) => {
  if (!process.env[key]) throw new Error(`Missing ${key}`);
  return process.env[key];
};
const sha = required('RELEASE_SHA');
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('Expected a full release SHA.');
let hook;
try {
  hook = new URL(required('HELLODEPLOY_HOOK_URL'));
} catch {
  throw new Error('Invalid HTTPS deploy hook.');
}
const match = /^\/api\/deploy-hooks\/([a-f0-9]{24})\/([^/]+)$/.exec(hook.pathname);
if (hook.protocol !== 'https:' || hook.username || hook.password || hook.search || !match)
  throw new Error('Invalid HTTPS deploy hook.');
const [, project, token] = match;
const directory = 'release-evidence';
await mkdir(directory, { recursive: true });
async function api(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch {
    throw new Error('HelloDeploy request failed; inspect the dashboard before retrying.');
  }
}
async function status(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new Error('Invalid deployment ID.');
  const result = await api(
    `${hook.origin}/api/deploy-hooks/${project}/deployments/${id}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  assertDeploymentIdentity(result, id, sha);
  return result;
}
const mode = process.argv[2];
if (mode === 'preflight') {
  const capabilities = await api(
    `${hook.origin}/api/deploy-hooks/${project}/capabilities`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (
    capabilities.protocolVersion !== 1 ||
    !capabilities.pinnedCommits ||
    !capabilities.publicBuildSnapshots ||
    !capabilities.concurrentDeploymentGuard ||
    capabilities.deploymentMode !== 'MANUAL' ||
    capabilities.runtimeType !== 'NEXTJS'
  )
    throw new Error(
      'HelloDeploy must be upgraded and configured for manual Next.js releases before migrations.',
    );
  if (
    capabilities.appUrl !== required('APP_URL') ||
    capabilities.supabaseUrl !== required('NEXT_PUBLIC_SUPABASE_URL') ||
    !/^[a-f0-9]{64}$/.test(capabilities.configurationFingerprint || '')
  )
    throw new Error('HelloDeploy target configuration does not match this environment.');
  const expectedClient = createHash('sha256')
    .update(
      JSON.stringify({
        NEXT_PUBLIC_APP_URL: required('APP_URL'),
        NEXT_PUBLIC_SUPABASE_ANON_KEY: required('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        NEXT_PUBLIC_SUPABASE_URL: required('NEXT_PUBLIC_SUPABASE_URL'),
      }),
    )
    .digest('hex');
  if (capabilities.clientConfigurationFingerprint !== expectedClient)
    throw new Error('HelloDeploy browser configuration differs from release settings.');
  await writeFile(
    `${directory}/platform.json`,
    JSON.stringify({
      project,
      configurationFingerprint: capabilities.configurationFingerprint,
    }),
  );
  console.log('Platform API, deployment guard and target configuration verified.');
} else if (mode === 'deploy') {
  const platform = JSON.parse(await readFile(`${directory}/platform.json`, 'utf8'));
  if (platform.project !== project) throw new Error('Preflight project mismatch.');
  // Exactly one POST: a lost response may still have queued a release.
  const result = await api(hook.href, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commitSha: sha }),
  });
  await writeFile(
    `${directory}/deployment.json`,
    JSON.stringify({ deploymentId: result.deploymentId, commitSha: sha }),
  );
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    const current = await status(result.deploymentId);
    if (current.configurationFingerprint !== platform.configurationFingerprint)
      throw new Error('Public configuration changed after preflight.');
    if (['FAILED', 'CANCELLED', 'ROLLED_BACK'].includes(current.status))
      throw new Error(`Deployment ended: ${current.status}`);
    if (current.status === 'HEALTHY' && current.active) {
      console.log(`Healthy deployment ${current.deploymentId}`);
      process.exit(0);
    }
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  throw new Error('Deployment timed out; inspect the dashboard.');
} else if (mode === 'verify') {
  const previous = JSON.parse(await readFile(`${directory}/deployment.json`, 'utf8'));
  const current = await status(previous.deploymentId);
  assertDeploymentIdentity(current, previous.deploymentId, sha, true);
  const origin = new URL(required('APP_URL'));
  if (origin.protocol !== 'https:' || origin.pathname !== '/')
    throw new Error('APP_URL must be an HTTPS origin.');
  for (const path of [
    '/api/health',
    '/api/health/ready',
    '/api/platform-check',
    '/',
    '/login',
    '/robots.txt',
    '/sitemap.xml',
  ]) {
    const response = await fetch(new URL(path, origin), {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error(`Smoke check failed: ${path}`);
    if (path.startsWith('/api/')) {
      const body = await response.json();
      if (
        path.endsWith('/ready')
          ? body.status !== 'ready'
          : path.endsWith('/platform-check')
            ? body.ok !== true
            : body.status !== 'ok'
      )
        throw new Error(`Unhealthy response: ${path}`);
    } else {
      const body = await response.text();
      if (path === '/sitemap.xml' && !body.includes(origin.origin))
        throw new Error('Sitemap origin mismatch.');
      if (path === '/') {
        const canonical = body.match(
          /<link\b(?=[^>]*rel="canonical")[^>]*href="([^"]+)"[^>]*>/,
        )?.[1];
        if (!canonical || new URL(canonical).origin !== origin.origin)
          throw new Error('Canonical origin mismatch.');
      }
    }
  }
  const privateResponse = await fetch(new URL('/dashboard', origin), {
    redirect: 'manual',
    signal: AbortSignal.timeout(15000),
  });
  const location = privateResponse.headers.get('location');
  if (
    ![302, 303, 307, 308].includes(privateResponse.status) ||
    !location ||
    new URL(location, origin).origin !== origin.origin ||
    new URL(location, origin).pathname !== '/login'
  )
    throw new Error('Signed-out dashboard redirect failed.');
  const last = await status(previous.deploymentId);
  if (
    !last.active ||
    last.status !== 'HEALTHY' ||
    last.configurationFingerprint !== current.configurationFingerprint
  )
    throw new Error('Release changed during verification.');
  const migrations = {};
  for (const name of (await readdir('supabase/migrations')).sort())
    if (name.endsWith('.sql'))
      migrations[name] = createHash('sha256')
        .update(await readFile(`supabase/migrations/${name}`))
        .digest('hex');
  const db = spawnSync(
    'psql',
    [
      '--no-psqlrc',
      '-v',
      'ON_ERROR_STOP=1',
      '-tA',
      required('DATABASE_URL'),
      '-c',
      'select version from public.schema_migrations order by version',
    ],
    { encoding: 'utf8', timeout: 15000 },
  );
  if (db.status !== 0) throw new Error('Migration evidence query failed.');
  const applied = db.stdout.trim().split('\n');
  if (Object.keys(migrations).some((name) => !applied.includes(name)))
    throw new Error('Release migrations are not all applied.');
  await writeFile(
    `${directory}/release.json`,
    JSON.stringify(
      {
        ...current,
        migrations,
        applied,
        environment: required('RELEASE_ENVIRONMENT'),
        verification: {
          smoke: true,
          migrations: true,
          stagingIntegration:
            process.env.RELEASE_ENVIRONMENT === 'staging' &&
            process.env.RELEASE_TESTS_PASSED === 'true',
          stagingBrowser:
            process.env.RELEASE_ENVIRONMENT === 'staging' &&
            process.env.RELEASE_TESTS_PASSED === 'true',
        },
        verifiedAt: new Date().toISOString(),
        runId: required('GITHUB_RUN_ID'),
      },
      null,
      2,
    ),
  );
  console.log('Release identity, public smoke checks, and migration evidence verified.');
} else throw new Error('Use preflight, deploy or verify.');
