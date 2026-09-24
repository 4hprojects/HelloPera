import { expect, it } from 'vitest';
// @ts-expect-error Operational ESM shared with the command-line runner.
import { assertStagingIdentity } from './staging-identity.mjs';
const valid = {
  TEST_SUPABASE_PROJECT_REF: 'staging',
  PRODUCTION_SUPABASE_PROJECT_REF: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://staging.supabase.co',
};
it('requires independent known project identities', () => {
  expect(() => assertStagingIdentity(valid)).not.toThrow();
  expect(() =>
    assertStagingIdentity({ ...valid, PRODUCTION_SUPABASE_PROJECT_REF: '' }),
  ).toThrow();
  expect(() =>
    assertStagingIdentity({ ...valid, PRODUCTION_SUPABASE_PROJECT_REF: 'staging' }),
  ).toThrow();
  expect(() =>
    assertStagingIdentity({
      ...valid,
      NEXT_PUBLIC_SUPABASE_URL: 'https://production.supabase.co',
    }),
  ).toThrow();
});
