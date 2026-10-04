import { assertStagingIdentity } from './staging-identity.mjs';
const env = process.env;
const ref = env.TEST_SUPABASE_PROJECT_REF;
if (!ref || !env.PRODUCTION_SUPABASE_PROJECT_REF)
  throw new Error('Project identities required.');
if (env.RELEASE_ENVIRONMENT === 'staging') assertStagingIdentity(env);
else if (
  env.RELEASE_ENVIRONMENT !== 'production' ||
  ref !== env.PRODUCTION_SUPABASE_PROJECT_REF
)
  throw new Error('Production identity mismatch.');
if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`)
  throw new Error('API project mismatch.');
let db;
try {
  db = new URL(env.DATABASE_URL);
} catch {
  throw new Error('Invalid migration database URL.');
}
if (
  !db.hostname.endsWith('.pooler.supabase.com') ||
  decodeURIComponent(db.username) !== `postgres.${ref}`
)
  throw new Error('Migration pooler identity mismatch.');
const expected =
  env.RELEASE_ENVIRONMENT === 'production'
    ? 'https://hellopera.online'
    : 'https://staging.hellopera.online';
if (env.APP_URL !== expected) throw new Error('Application origin mismatch.');
console.log('Release project and origin verified.');
