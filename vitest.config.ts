import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**'],
    /**
     * `lib/env` validates configuration at import and throws when it is
     * missing — deliberately, so a misconfigured deployment fails at startup
     * rather than at the first request. That makes any module importing it
     * untestable without values.
     *
     * These are syntactically valid placeholders, never real credentials. The
     * anon key is an unsigned JWT whose payload says role=anon, because the
     * env schema checks that claim rather than merely that a string exists.
     */
    env: {
      NEXT_PUBLIC_SUPABASE_URL: 'https://testtesttesttesttest.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.test-signature-not-real',
      NEXT_PUBLIC_APP_URL: 'https://hellopera.test',
    },
  },
});
