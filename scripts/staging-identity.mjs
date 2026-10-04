export function assertStagingIdentity(env) {
  const ref = env.TEST_SUPABASE_PROJECT_REF;
  const production = env.PRODUCTION_SUPABASE_PROJECT_REF;
  if (!ref || !production)
    throw new Error('Both staging and production project references are required.');
  if (ref === production) throw new Error('Fixture tests must never target production.');
  if (new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname !== `${ref}.supabase.co`)
    throw new Error('Test project identity does not match the configured Supabase URL.');
  if (env.E2E_BASE_URL && new URL(env.E2E_BASE_URL).hostname === 'hellopera.online')
    throw new Error('Fixture tests must never target the production application.');
}
