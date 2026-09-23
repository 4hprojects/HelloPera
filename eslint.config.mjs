import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/**
 * Flat config. eslint-config-next 16 exports flat arrays directly, so no
 * FlatCompat shim is needed.
 */
const config = [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/**',
      'playwright-report/**',
      'test-results/**',
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // Phase 00 §22: `any` requires a documented reason.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
];

export default config;
