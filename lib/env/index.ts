import { z } from 'zod';

/**
 * Environment validation — Phase 00 §14.
 *
 * Validates shape, not just presence. A present-but-wrong value is harder to
 * diagnose than a missing one, because it fails far from its cause.
 *
 * Two checks here exist because both mistakes have already happened once:
 *
 *  1. `db.<ref>.supabase.co` is the Postgres host, not the API URL. It speaks
 *     the wire protocol on 5432, serves no HTTP, and is IPv6-only — so on an
 *     IPv4 network it presents as an unexplained network timeout.
 *
 *  2. A `service_role` key behind NEXT_PUBLIC_ ships full RLS-bypassing
 *     database access to every browser. It is indistinguishable from the anon
 *     key by eye; the difference is a claim inside the JWT.
 */

/** Decode a JWT payload without verifying it. Enough to read the role claim. */
function readJwtRole(token: string): string | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payload = parts[1];
  if (!payload) return null;
  try {
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(
      padded + '='.repeat((4 - (padded.length % 4)) % 4),
      'base64',
    ).toString('utf8');
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

const supabaseUrl = z
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

const supabaseAnonKey = z
  .string()
  .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  .refine(
    (value) => {
      // Newer publishable keys are not JWTs; only role-check the JWT form.
      if (!value.startsWith('eyJ')) return true;
      return readJwtRole(value) !== 'service_role';
    },
    {
      message:
        'NEXT_PUBLIC_SUPABASE_ANON_KEY carries role="service_role". That key bypasses ' +
        'RLS and must never reach the browser. Use the anon/publishable key instead.',
    },
  );

/**
 * Server-only. Bypasses RLS entirely, so it must never be prefixed
 * NEXT_PUBLIC_ and must never be imported into a client component.
 *
 * Required from Phase 01: user-owned tables grant the browser SELECT only, so
 * every mutation runs through a server action holding this key, with ownership
 * checked in code first.
 */
const serviceRoleKey = z
  .string()
  .min(1)
  .refine(
    (value) => {
      if (value.startsWith('eyJ')) return readJwtRole(value) !== 'anon';
      // New-format keys: only sb_secret_ grants privileged access.
      if (value.startsWith('sb_')) return value.startsWith('sb_secret_');
      return true;
    },
    {
      message:
        'That is not a Supabase secret key. It must start "sb_secret_", or be the ' +
        'legacy service_role JWT. A publishable/anon key has no write access, and ' +
        '"sb_service_role_..." is not a real Supabase prefix.',
    },
  )
  .optional();

const schema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default('HelloPera'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3030'),
  NEXT_PUBLIC_APP_URL_DEV: z.string().url().optional(),
  // Supabase's current dashboard calls this the "secret key"; older projects
  // and docs call it the service-role key. Accept either name so the value
  // does not have to be duplicated under two keys.
  SUPABASE_SECRET_KEY: serviceRoleKey,
  SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,

  // Web push (PHASE-08 §56, §57). All optional: push is an enhancement, and
  // the rest of the app must start without it — an unconfigured deployment
  // should lose push notifications, not fail to boot.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().min(1).optional(),
  VAPID_PRIVATE_KEY: z.string().min(1).optional(),
  // A mailto: or https: URL identifying the sender, required by the Web Push
  // spec so a push service can contact whoever is sending.
  VAPID_SUBJECT: z.string().min(1).optional(),
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  // Next.js inlines NEXT_PUBLIC_* at build time only for literal property
  // access, so these cannot be read from a loop over process.env.
  const parsed = schema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_APP_URL_DEV: process.env.NEXT_PUBLIC_APP_URL_DEV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    // Fail loudly at startup rather than silently at the first request.
    throw new Error(
      `Invalid environment configuration:\n${issues}\n\n` +
        `Copy .env.example to .env.local and fill it in.`,
    );
  }

  return parsed.data;
}

export const env = load();

/**
 * The app's own public origin.
 *
 * In development this must be localhost, not the production domain: metadata,
 * canonical URLs and any origin fallback would otherwise point at a host that
 * is not serving this build. hellopera.online does not resolve to anything yet,
 * so a dev link there is a dead end rather than a wrong-but-working one.
 *
 * Request-time code should still prefer the forwarded Host header — see the
 * auth callback. This is the fallback for contexts with no request, such as
 * `metadataBase`.
 */
export function appUrl(): string {
  if (process.env.NODE_ENV !== 'production' && env.NEXT_PUBLIC_APP_URL_DEV) {
    return env.NEXT_PUBLIC_APP_URL_DEV;
  }
  return env.NEXT_PUBLIC_APP_URL;
}

/**
 * Service-role key or a clear failure.
 *
 * Deliberately a function rather than a validated-required field: the public
 * site and the build must work without it, but any code path that writes must
 * fail loudly rather than silently attempting a write RLS will reject.
 */
export function requireServiceRoleKey(): string {
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) {
    throw new Error(
      'No Supabase secret key is set. Server actions that write to user-owned ' +
        'tables need it, because the browser role holds SELECT only.\n\n' +
        'Set SUPABASE_SECRET_KEY (sb_secret_...) from:\n' +
        '  Dashboard > Project Settings > API Keys > Secret keys\n' +
        'SUPABASE_SERVICE_ROLE_KEY is also accepted for the legacy JWT form.\n' +
        'Server-only — never prefix either with NEXT_PUBLIC_.',
    );
  }
  return key;
}

/**
 * Is web push configured? — PHASE-08 §56.
 *
 * Checked rather than assumed, so a deployment without VAPID keys degrades to
 * in-app notifications instead of throwing on the first send. The private key
 * is never exposed: only this boolean and the public key reach a client.
 */
export function isPushConfigured(): boolean {
  return Boolean(
    env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT,
  );
}
