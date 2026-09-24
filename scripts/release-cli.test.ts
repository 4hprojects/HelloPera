import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';
const script = resolve('scripts/release.mjs');
for (const scenario of ['healthy', 'failed', 'mismatch', 'network', 'timeout']) {
  it(`release CLI handles ${scenario} without repeating the deploy POST`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'hello-release-test-'));
    try {
      mkdirSync(join(directory, 'release-evidence'));
      writeFileSync(
        join(directory, 'release-evidence/platform.json'),
        JSON.stringify({
          project: 'b'.repeat(24),
          configurationFingerprint: 'c'.repeat(64),
        }),
      );
      const stub = join(directory, 'mock.mjs');
      writeFileSync(
        stub,
        `
        import { appendFileSync } from 'node:fs';
        ${scenario === 'timeout' ? 'let time = 0; Date.now = () => { const current = time; time += 21 * 60000; return current; };' : ''}
        globalThis.fetch = async (url, options) => {
          appendFileSync('calls', (options.method || 'GET') + '\\n');
          if (options.method === 'POST') {
            ${scenario === 'network' ? "throw new Error('url with private-hook-token');" : "return Response.json({ deploymentId: 'b'.repeat(24) });"}
          }
          return Response.json({ deploymentId: 'b'.repeat(24), commitSha: '${scenario === 'mismatch' ? 'c' : 'a'}'.repeat(40), status: '${scenario === 'failed' ? 'FAILED' : 'HEALTHY'}', active: true, configurationFingerprint: 'c'.repeat(64) });
        };
      `,
      );
      const result = spawnSync(process.execPath, ['--import', stub, script, 'deploy'], {
        cwd: directory,
        encoding: 'utf8',
        timeout: 5000,
        env: {
          PATH: process.env.PATH,
          NODE_ENV: 'test',
          RELEASE_SHA: 'a'.repeat(40),
          HELLODEPLOY_HOOK_URL: `https://deploy.example/api/deploy-hooks/${'b'.repeat(24)}/private-hook-token`,
        },
      });
      expect(result.status).toBe(scenario === 'healthy' ? 0 : 1);
      expect(readFileSync(join(directory, 'calls'), 'utf8').match(/POST/g)).toHaveLength(
        1,
      );
      expect(result.stderr).not.toContain('private-hook-token');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
for (const scenario of ['compatible', 'old', 'wrong-target']) {
  it(`preflight rejects an unverified platform before migrations: ${scenario}`, () => {
    const directory = mkdtempSync(join(tmpdir(), 'hello-preflight-test-'));
    try {
      const stub = join(directory, 'mock.mjs');
      writeFileSync(
        stub,
        `
        import { createHash } from 'node:crypto';
        const clientConfigurationFingerprint = createHash('sha256').update(JSON.stringify({ NEXT_PUBLIC_APP_URL: 'https://staging.hellopera.online', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test', NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co' })).digest('hex');
        globalThis.fetch = async () => Response.json(${scenario === 'old' ? '{}' : `{ protocolVersion: 1, pinnedCommits: true, publicBuildSnapshots: true, concurrentDeploymentGuard: true, deploymentMode: 'MANUAL', runtimeType: 'NEXTJS', appUrl: '${scenario === 'wrong-target' ? 'https://hellopera.online' : 'https://staging.hellopera.online'}', supabaseUrl: 'https://staging.supabase.co', configurationFingerprint: 'c'.repeat(64), clientConfigurationFingerprint }`});
      `,
      );
      const result = spawnSync(
        process.execPath,
        ['--import', stub, script, 'preflight'],
        {
          cwd: directory,
          encoding: 'utf8',
          timeout: 5000,
          env: {
            NODE_ENV: 'test',
            PATH: process.env.PATH,
            RELEASE_SHA: 'a'.repeat(40),
            HELLODEPLOY_HOOK_URL: `https://deploy.example/api/deploy-hooks/${'b'.repeat(24)}/private-hook-token`,
            APP_URL: 'https://staging.hellopera.online',
            NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
            NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test',
          },
        },
      );
      expect(result.status).toBe(scenario === 'compatible' ? 0 : 1);
      expect(result.stderr).not.toContain('private-hook-token');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
