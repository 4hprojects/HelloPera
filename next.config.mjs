/** @type {import('next').NextConfig} */
const nextConfig = {
  // HelloDeploy's generated Dockerfile copies .next/standalone.
  // See docs/PLATFORM-HELLODEPLOY.md note A — a bare standalone output is
  // sufficient for Sharp; no extra tracing config is required.
  output: 'standalone',

  // Phase 00 §26: security headers. CSP is deliberately deferred to Phase 01,
  // where the Supabase and OAuth origins it must allow are known.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            // Camera is needed from Phase 04 (receipt capture); allow self now
            // so the policy does not have to be rediscovered later.
            value: 'camera=(self), microphone=(), geolocation=(), interest-cohort=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
