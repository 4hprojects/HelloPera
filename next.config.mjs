/** @type {import('next').NextConfig} */
const nextConfig = {
  // HelloDeploy's generated Dockerfile copies .next/standalone.
  // See docs/PLATFORM-HELLODEPLOY.md note A — a bare standalone output is
  // sufficient for Sharp; no extra tracing config is required.
  output: 'standalone',

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
