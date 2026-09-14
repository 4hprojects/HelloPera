import 'server-only';

import { cookies } from 'next/headers';
import { isAdsConfigured } from '@/lib/env';
import { isFlagEnabled } from '@/services/plan.service';
import { COOKIE_NAME, DEFAULT_CONSENT, parseConsent } from '@/lib/consent/categories';
import type { ConsentState } from '@/lib/consent/categories';

/**
 * Server-side ad context — PHASE-10 §53, §54.
 *
 * Gathers the three inputs `adEligibility` needs, so a page does not have to
 * remember which flag, which entitlement and which cookie. One call, and the
 * page cannot accidentally check two of the three.
 *
 * ## On public pages there is no user
 *
 * `adsShown` is therefore `true` here: it is a per-user entitlement and an
 * anonymous visitor has none. The global flag and consent are the only gates
 * that apply, which is correct — a signed-out visitor to a guide cannot be
 * Premium.
 *
 * Inside the authenticated app the caller passes the real
 * `entitlements.adsShown`. That path does not exist today, because §8 keeps
 * ads out of the application entirely.
 */
export type AdContext = {
  globalEnabled: boolean;
  configured: boolean;
  consent: ConsentState;
};

export async function getAdContext(): Promise<AdContext> {
  /**
   * ## Why this returns early
   *
   * Reading cookies makes the calling route **dynamic**. Mounting an ad slot
   * on the guides naively turned every article from prerendered (`●`) into
   * server-rendered (`ƒ`) — paying a render per view, on a content site whose
   * whole purpose is to be crawled and fast, for an ad that does not exist
   * yet.
   *
   * So when no publisher id is configured, nothing is read: no cookie, no
   * feature flag, no database round trip. The articles stay static, which is
   * the correct state for the entire period before AdSense is approved.
   *
   * Once a publisher id IS set, articles become dynamic. That is a deliberate
   * trade, made at the moment ads actually exist rather than months early.
   */
  const configured = isAdsConfigured();
  if (!configured) {
    return { globalEnabled: false, configured: false, consent: DEFAULT_CONSENT };
  }

  const store = await cookies();
  const raw = store.get(COOKIE_NAME)?.value;
  const globalEnabled = await isFlagEnabled('ads_enabled_global');

  return {
    globalEnabled,
    configured,
    consent: raw ? parseConsent(decodeURIComponent(raw)) : DEFAULT_CONSENT,
  };
}
