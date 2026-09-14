import { NextResponse } from 'next/server';
import { getBillingProvider } from '@/lib/billing/provider';
import { processWebhookEvent } from '@/services/billing-webhook.service';
import { log } from '@/lib/log';
import {
  clientIp,
  enforceRateLimit,
  RateLimitError,
} from '@/services/rate-limit.service';

/**
 * Provider webhook endpoint — PHASE-11 §15 to §21, criterion 7.
 *
 * ## The route verifies nothing itself
 *
 * §15 puts signature verification in the adapter, because only the adapter
 * knows what its provider signs, with which header, and over what bytes. This
 * route's whole job is to hand the adapter the *exact* body that arrived and
 * refuse whatever it will not vouch for.
 *
 * Hence `request.text()` and not `request.json()`: every provider signs the
 * raw bytes, and a parse-then-restringify changes them — key order, whitespace,
 * number formatting — so the signature stops matching. This is the single most
 * common way a webhook integration fails.
 *
 * ## With no provider configured, everything is refused
 *
 * `NoopBillingProvider.handleWebhook` returns null. So on a deployment with no
 * adapter this endpoint accepts nothing at all, rather than trusting a POST
 * from anyone who found the URL. Failing closed is the only safe default for
 * an endpoint that moves people between paid and free.
 *
 * ## Status codes are instructions to the provider
 *
 * Providers retry on non-2xx. So:
 *  - a bad signature is 401 and stays 401 — retrying will not fix it;
 *  - an event we processed, ignored, or had already seen is 200, because it
 *    needs no redelivery;
 *  - only a genuine server fault is 500, which is the one case where we do
 *    want the provider to try again.
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: Request): Promise<NextResponse> {
  const provider = getBillingProvider();

  /**
   * PHASE-14 §38 — a ceiling on abuse, not a throttle on traffic.
   *
   * Signature verification is not free, and an attacker does not need to pass
   * it to make us pay for it. The limit is per source and deliberately
   * generous, because a provider recovering from an outage delivers a backlog
   * all at once and a refused webhook is a subscription that silently stops
   * matching reality.
   *
   * 429 rather than a silent drop, so a legitimate provider retries.
   */
  try {
    await enforceRateLimit('billing_webhook', `ip:${await clientIp()}`);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json(
        { error: 'Too many requests.' },
        { status: 429, headers: { 'retry-after': String(error.retryAfterSeconds) } },
      );
    }
    throw error;
  }

  const rawBody = await request.text();

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  let event;
  try {
    event = await provider.handleWebhook(rawBody, headers);
  } catch (error) {
    log.error('billing webhook: verification threw', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  if (!event) {
    // Either the signature did not check out, or no provider is configured.
    // The response is identical in both cases on purpose — telling an
    // unauthenticated caller which one it was tells them whether the endpoint
    // is live and worth probing.
    log.warn('billing webhook: rejected unverified event');
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 401 });
  }

  try {
    const outcome = await processWebhookEvent(event, provider.name);
    return NextResponse.json(outcome);
  } catch (error) {
    log.error('billing webhook: processing failed', {
      m: error instanceof Error ? error.message : 'unknown',
    });
    // 500 so the provider redelivers. The event row is marked `failed`, which
    // the service treats as retryable rather than a duplicate to skip.
    return NextResponse.json({ error: 'Processing failed.' }, { status: 500 });
  }
}

/**
 * §58 (Phase 08's rule, same reasoning) — a GET would be followed by link
 * previewers and crawlers. Answering 405 also makes a misconfigured provider
 * endpoint obvious in their dashboard rather than silently succeeding.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 });
}
