import Script from 'next/script';
import { env, isAdsConfigured } from '@/lib/env';

/**
 * The AdSense loader — PHASE-10 §55, §57.
 *
 * Scaffolded, inert until configured. It renders nothing unless a publisher id
 * is set AND the global flag is on AND the visitor consented — see
 * `lib/ads/eligibility.ts` for the full rule.
 *
 * ## Why `afterInteractive` and not `beforeInteractive`
 *
 * §57 and §63 both care about public performance. The ad script is third-party
 * and heavy; loading it before hydration delays the page for a unit that, by
 * §59's density rule, is never the reason someone came. `afterInteractive`
 * loads it once the page is usable.
 *
 * ## Why it is not in the root layout
 *
 * §8 keeps advertising out of the authenticated application entirely. Mounting
 * the loader globally would put the script on every financial screen even if
 * no slot rendered there — the script itself is the tracking surface, not just
 * the visible unit.
 */
export function AdSenseScript({
  globalEnabled,
  hasConsent,
}: {
  /** PHASE-09 `feature_flags.ads_enabled_global`. */
  globalEnabled: boolean;
  /** The visitor's advertising consent. */
  hasConsent: boolean;
}) {
  // §49 — "Do not load non-essential tracking before required consent."
  // The script is loaded only after a positive decision, not merely in the
  // absence of a refusal.
  if (!isAdsConfigured() || !globalEnabled || !hasConsent) return null;

  const client = env.NEXT_PUBLIC_ADSENSE_CLIENT_ID!;

  return (
    <Script
      id="adsense"
      strategy="afterInteractive"
      async
      crossOrigin="anonymous"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${client}`}
    />
  );
}
