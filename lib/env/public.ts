import { z } from 'zod';

/**
 * Browser-safe environment — the only env module a client component may import.
 *
 * Holds nothing but NEXT_PUBLIC_ values, which Next.js inlines into the bundle
 * anyway. Secrets live in `./index`, which is `server-only`: importing it from
 * client code fails the build instead of quietly bundling server logic.
 */

/** Decode a JWT payload without verifying it. Enough to read the role claim. */
export function readJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    // atob rather than Buffer, so this also runs in the browser.
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
    const json = new TextDecoder().decode(
      Uint8Array.from(binary, (c) => c.charCodeAt(0)),
    );
    const claims: unknown = JSON.parse(json);
    if (typeof claims === 'object' && claims !== null && 'role' in claims) {
      const role = (claims as { role: unknown }).role;
      return typeof role === 'string' ? role : null;
    }
    return null;
  } catch {
    return null;
  }
}

export const supabaseUrl = z
  .string()
  .min(1, 'NEXT_PUBLIC_SUPABASE_URL is required')
  .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
  .refine((value) => !/^https?:\/\/db\./i.test(value), {
    message:
      'NEXT_PUBLIC_SUPABASE_URL points at the database host. Remove the "db." prefix — ' +
      'use https://<ref>.supabase.co (Dashboard > Settings > API > Project URL). ' +
      'The db. host serves Postgres on 5432, not the REST/Auth API.',
  })
  .refine((value) => !value.endsWith('/'), {
    message: 'NEXT_PUBLIC_SUPABASE_URL must not have a trailing slash.',
  });

export const supabaseAnonKey = z
  .string()
  .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  .refine(
    (value) => {
      // Newer publishable keys are not JWTs; only role-check the JWT form.
      if (value.startsWith('sb_secret_')) return false;
      if (!value.startsWith('eyJ')) return true;
      return readJwtRole(value) !== 'service_role';
    },
    {
      message:
        'NEXT_PUBLIC_SUPABASE_ANON_KEY carries role="service_role". That key bypasses ' +
        'RLS and must never reach the browser. Use the anon/publishable key instead.',
    },
  );

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
});

// Literal property access: Next.js only inlines NEXT_PUBLIC_* written this way.
export const publicEnv = schema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
});
