import { adEligibility } from '@/lib/ads/eligibility';
import { DEFAULT_CONSENT, type ConsentState } from '@/lib/consent/categories';

/**
 * An advertising slot — PHASE-10 §53, §58, §59, §60, §61.
 *
 * Renders nothing today: `ads_enabled_global` is false and no publisher id is
 * configured, so `adEligibility` refuses. That is the intended Phase 10 state
 * — the infrastructure exists and is tested; switching it on is a Phase 10
 * deployment decision after AdSense review, not a code change.
 *
 * When it does render:
 *
 *  - §60 requires a label. An unlabelled ad in a finance app reads as a
 *    product recommendation from us, which it is not.
 *  - §58 requires reserved height. An ad that arrives late and pushes content
 *    down is how people tap the wrong thing.
 *  - §61 and criterion 19 forbid anything resembling navigation or an app
 *    control, so the slot is visually inert: no border that looks like a card,
 *    no placement inside a list of actions.
 */
export function AdSlot({
  pathname,
  globalEnabled,
  adsShown,
  consent = DEFAULT_CONSENT,
  configured,
  /** §59 — reserved height, so nothing shifts when the ad loads. */
  height = 250,
}: {
  pathname: string;
  globalEnabled: boolean;
  adsShown: boolean;
  consent?: ConsentState;
  configured: boolean;
  height?: number;
}) {
  const eligibility = adEligibility({
    pathname,
    globalEnabled,
    adsShown,
    consent,
    configured,
  });

  // Render nothing at all — not an empty box, not a placeholder. §59's density
  // rule is about what the reader sees, and a reserved grey rectangle with no
  // ad in it is worse than the content simply continuing.
  if (!eligibility.allowed) return null;

  return (
    <aside
      aria-label="Advertisement"
      className="mx-auto my-8 w-full max-w-[728px]"
      style={{ minHeight: height }}
    >
      {/* §60 — labelled, in text, above the unit. */}
      <p className="hp-label mb-1 text-center text-text-muted">Advertisement</p>
      <div
        className="flex w-full items-center justify-center bg-surface-raised"
        style={{ minHeight: height }}
      >
        {/*
          PHASE-10 §55-§57 owns the actual AdSense unit. Deliberately not
          stubbed with a fake: a placeholder that looks like an ad teaches the
          layout to expect the wrong dimensions, and a script tag with no
          publisher id is a console error on every page.
        */}
      </div>
    </aside>
  );
}
