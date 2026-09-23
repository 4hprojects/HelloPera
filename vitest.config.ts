import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
      /**
       * `server-only` throws on import outside a Server Component, which makes
       * any module carrying it untestable — including `lib/ai/claude-provider.ts`,
       * the one piece of Phase 12 that would otherwise need a real key and a
       * network to verify at all.
       *
       * The package ships `empty.js` for exactly this purpose: it is what the
       * `react-server` condition already resolves to. Aliasing here weakens
       * nothing in production, where Next still enforces the boundary at build
       * time and a client import remains a build error.
       */
      'server-only': fileURLToPath(
        new URL('./node_modules/server-only/empty.js', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: process.env.HELLOPERA_ONLY_INTEGRATION
      ? ['**/*.integration.test.ts']
      : ['**/*.test.ts', '**/*.test.tsx'],
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
     *
     * The integration suite is the exception: it exists to talk to the real
     * project, and placeholders here silently pointed it at a host that does not
     * exist (every test failed with ENOTFOUND, and the unit-test URL was being
     * paired with the real secret key). `npm run test:integration` sets
     * HELLOPERA_INTEGRATION=1 and loads `.env`, and only then are the real
     * values left alone.
     */
    env: process.env.HELLOPERA_INTEGRATION
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_URL: 'https://testtesttesttesttest.supabase.co',
          NEXT_PUBLIC_SUPABASE_ANON_KEY:
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.test-signature-not-real',
          NEXT_PUBLIC_APP_URL: 'https://hellopera.test',
        },
  },
});
