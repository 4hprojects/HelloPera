import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * HP-008 — every server action and route handler has an explicit, reviewed
 * authorization boundary. Adding an entrypoint without declaring one here fails
 * this test; declaring one that the source does not contain also fails it.
 */

type Boundary =
  | 'user' // requireUser(): authenticated, active, verified
  | 'admin' // adminAction(): active admin, reason, atomic audit
  | 'public' // intentionally unauthenticated; rate limited / input validated
  | 'secret' // shared-secret bearer, fails closed when unset
  | 'provider-signature' // webhook signature verified by the provider adapter
  | 'session-api' // getAuthResult(): 401/403 JSON, no redirect
  | 'oauth-callback'; // one-time code exchange, open-redirect guard, status routing

const ROOT = process.cwd();

const ACTION_PUBLIC = new Set([
  'registerWithEmail',
  'loginWithEmail',
  'requestPasswordReset',
  'resetPassword',
]);

/**
 * Deliberately reachable in any account state: a suspended user must still be
 * able to sign out, and OAuth start carries no user data (the provider and
 * Supabase Auth enforce their own limits).
 */
const ACTION_SESSION_ONLY = new Set(['logout']);
const ACTION_OAUTH_START = new Set(['loginWithGoogle']);

const ROUTES: Record<string, Boundary> = {
  'app/api/documents/[id]/[which]/route.ts': 'session-api',
  'app/api/export/route.ts': 'session-api',
  'app/api/scheduler/route.ts': 'secret',
  'app/api/billing/webhook/route.ts': 'provider-signature',
  'app/api/health/route.ts': 'public',
  'app/api/health/ready/route.ts': 'public',
  'app/api/platform-check/route.ts': 'public',
  'app/auth/callback/route.ts': 'oauth-callback',
};

function walk(dir: string, match: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full, match);
    return match.test(entry.name) ? [full] : [];
  });
}

function actionBodies(file: string): Map<string, string> {
  const source = readFileSync(file, 'utf8');
  const starts = [...source.matchAll(/^export async function (\w+)/gm)];
  const bodies = new Map<string, string>();
  starts.forEach((m, i) => {
    bodies.set(m[1]!, source.slice(m.index!, starts[i + 1]?.index ?? source.length));
  });
  return bodies;
}

describe('server actions', () => {
  const files = walk(join(ROOT, 'app/actions'), /\.ts$/).filter(
    (f) => !f.endsWith('.test.ts'),
  );

  for (const file of files) {
    for (const [name, body] of actionBodies(file)) {
      const label = `${relative(ROOT, file)}#${name}`;

      if (ACTION_PUBLIC.has(name)) {
        it(`${label} is public but rate limited or validated`, () => {
          expect(body).toMatch(/enforceRateLimit|safeParse|redirectIfAuthenticated/);
          expect(body).not.toMatch(/createAdminClient\(\)\s*\.from\('profiles'\)/);
        });
        continue;
      }

      if (ACTION_SESSION_ONLY.has(name)) {
        it(`${label} is session-only by design`, () => {
          expect(body).toMatch(/signOut\(\)/);
          expect(body).not.toMatch(/createAdminClient/);
        });
        continue;
      }

      if (ACTION_OAUTH_START.has(name)) {
        it(`${label} only starts the provider flow`, () => {
          expect(body).toMatch(/signInWithOAuth/);
          expect(body).not.toMatch(/createAdminClient/);
        });
        continue;
      }

      if (file.endsWith('app/actions/admin.ts')) {
        it(`${label} goes through adminAction`, () => {
          expect(body).toMatch(/await adminAction\(/);
          expect(body).not.toMatch(/createAdminClient|\.from\(/);
        });
        continue;
      }

      it(`${label} requires an active verified user`, () => {
        expect(body).toMatch(/requireUser\(\)|requireAdmin\(\)|getAuthResult\(\)/);
      });
    }
  }
});

describe('route handlers', () => {
  const found = walk(join(ROOT, 'app'), /^route\.ts$/).map((f) => relative(ROOT, f));

  it('every route has a declared boundary, and none is stale', () => {
    expect(found.sort()).toEqual(Object.keys(ROUTES).sort());
  });

  for (const [file, boundary] of Object.entries(ROUTES)) {
    it(`${file} enforces its ${boundary} boundary`, () => {
      const source = readFileSync(join(ROOT, file), 'utf8');
      switch (boundary) {
        case 'session-api':
          expect(source).toMatch(/getAuthResult\(\)/);
          expect(source).toMatch(/401/);
          expect(source).toMatch(/403/);
          break;
        case 'secret':
          expect(source).toMatch(/SCHEDULER_SECRET/);
          expect(source).toMatch(/timingSafeEqual/);
          expect(source).toMatch(/503/);
          break;
        case 'provider-signature':
          expect(source).toMatch(/handleWebhook\(/);
          expect(source).toMatch(/enforceRateLimit/);
          break;
        case 'oauth-callback':
          expect(source).toMatch(/exchangeCodeForSession\(code\)/);
          expect(source).toMatch(/startsWith\('\/\/'\)/);
          expect(source).toMatch(/account-suspended/);
          expect(source).toMatch(/account-disabled/);
          break;
        case 'public':
          // Public probes must not read a user session or return user data.
          expect(source).not.toMatch(
            /getCurrentUser|requireUser|\.from\('(profiles|transactions|accounts)'/,
          );
          break;
      }
    });
  }
});

describe('admin mutation seam', () => {
  it('services/admin.service.ts exposes no write helpers outside adminAction', () => {
    const source = readFileSync(join(ROOT, 'services/admin.service.ts'), 'utf8');
    expect(source).not.toMatch(/\.(insert|update|delete|upsert)\(/);
  });
});
