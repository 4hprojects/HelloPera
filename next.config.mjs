/** Launch CSP is enforced and covered by public browser checks.
 * Re-test third-party origins before enabling any provider-backed feature.
 */

/**
 * The Supabase origin, derived rather than hardcoded.
 *
 * `CSP-NOTES.md` writes it as `<ref>.supabase.co`. A placeholder committed into
 * a header is a CSP that blocks the database on the first deploy to any other
 * project — so it comes from the same variable the client already uses, and
 * falls back to a wildcard subdomain if the variable is missing at build time
 * rather than emitting a broken directive.
 */
function supabaseOrigins() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return ['https://*.supabase.co', 'wss://*.supabase.co'];
  try {
    const { host } = new URL(url);
    return [`https://${host}`, `wss://${host}`];
  } catch {
    return ['https://*.supabase.co', 'wss://*.supabase.co'];
  }
}

const CSP = [
  "default-src 'self'",
  // Next.js injects inline bootstrap scripts. Removing 'unsafe-inline' means
  // threading a nonce through the document — worth doing, not launch-blocking,
  // and recorded as such in CSP-NOTES.
  "script-src 'self' 'unsafe-inline' https://pagead2.googlesyndication.com",
  "style-src 'self' 'unsafe-inline'",
  // `blob:` is for document previews rendered before upload (Phase 04).
  "img-src 'self' data: blob: https://*.supabase.co https://*.googlesyndication.com https://*.doubleclick.net",
  "font-src 'self' data:",
  // Deliberately NOT api.anthropic.com. OCR and the assistant run server-side;
  // listing it would imply the browser talks to Anthropic, which would mean the
  // API key was client-side.
  `connect-src 'self' ${supabaseOrigins().join(' ')}`,
  'frame-src https://googleads.g.doubleclick.net https://tpc.googlesyndication.com',
  // Duplicates X-Frame-Options: DENY on purpose — the header for older
  // browsers, the directive for newer ones.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  // HelloDeploy's generated Dockerfile copies .next/standalone.
  // See docs/PLATFORM-HELLODEPLOY.md note A — a bare standalone output is
  // sufficient for Sharp; no extra tracing config is required.
  output: 'standalone',
  experimental: { serverActions: { bodySizeLimit: '9mb' } },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            /**
             * §44. Two years, subdomains included, and preload-eligible.
             *
             * This one has no blocker — it needs only HTTPS, which the
             * deployment has — but it is worth knowing that it is hard to undo:
             * a browser that has seen it refuses plain HTTP for the whole
             * `max-age`. That is the point, and it is also why the domain
             * should be settled before the first visitor arrives.
             */
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            // Enforced for the free launch; see docs/CSP-NOTES.md.
            key: 'Content-Security-Policy',
            value: CSP,
          },
          {
            key: 'Permissions-Policy',
            /**
             * PHASE-10 §54 — `interest-cohort=()` was reviewed and KEPT.
             *
             * It opts out of Google's interest-based ad targeting (FLoC, and
             * its Topics successor). Keeping it means any advertising served
             * here is contextual rather than behavioural.
             *
             * That is a deliberate trade, not an oversight. Contextual ads pay
             * less. But HelloPera holds people's financial records, and the
             * privacy policy states plainly that those records are never used
             * to target an advertisement — a browsing-topics signal collected
             * on a personal-finance domain sits uncomfortably close to that
             * promise even though it never touches the records themselves.
             *
             * If ad revenue later justifies revisiting this, it is a one-line
             * change here and a paragraph in the privacy policy. It should not
             * be changed without the second.
             *
             * Camera is allowed for `self` from Phase 04 (receipt capture).
             */
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
