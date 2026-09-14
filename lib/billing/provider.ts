/**
 * Billing provider abstraction — PHASE-09 §39, §40.
 *
 * Defined now, implemented in Phase 11. §40 is the constraint that matters:
 * nothing provider-specific may leak into business logic, because the cost of
 * discovering otherwise is a rewrite of everything that touches billing when
 * the provider changes — and for a Philippines-focused product, the provider
 * quite plausibly will change.
 *
 * So the interface speaks in HelloPera's own terms. Provider-shaped detail
 * lives in `subscription_events.payload` and the two opaque id columns on
 * `subscriptions`.
 */

export type CheckoutRequest = {
  userId: string;
  planCode: string;
  /** Where the provider returns the user after success or cancellation. */
  successUrl: string;
  cancelUrl: string;
};

export type CheckoutSession = {
  /** Where to send the browser. Null when the provider is a no-op. */
  url: string | null;
  providerSessionId: string | null;
};

export type ProviderSubscription = {
  providerSubscriptionId: string;
  providerCustomerId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
};

/**
 * A webhook already verified and normalised by the adapter.
 *
 * The adapter owns signature verification: it is the only layer that knows
 * what the provider signs and how.
 */
export type NormalisedWebhookEvent = {
  providerEventId: string;
  eventType: string;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  payload: Record<string, unknown>;
};

export interface BillingProvider {
  readonly name: string;
  /** False for the no-op, so callers can hide checkout without special cases. */
  readonly isLive: boolean;

  createCheckoutSession(request: CheckoutRequest): Promise<CheckoutSession>;
  cancelSubscription(providerSubscriptionId: string): Promise<void>;
  getSubscription(providerSubscriptionId: string): Promise<ProviderSubscription | null>;
  /** Verifies and normalises, or returns null if the signature does not check out. */
  handleWebhook(
    rawBody: string,
    headers: Record<string, string>,
  ): Promise<NormalisedWebhookEvent | null>;
}

/**
 * The Phase 09 implementation: does nothing, honestly.
 *
 * It does not pretend to create a session or fabricate a subscription — a mock
 * that returns plausible-looking success would let a checkout flow appear to
 * work in development and fail only in production, which is the failure mode
 * worth avoiding. `isLive: false` lets the UI say "coming soon" rather than
 * offering a button that goes nowhere.
 */
export class NoopBillingProvider implements BillingProvider {
  readonly name = 'noop';
  readonly isLive = false;

  async createCheckoutSession(): Promise<CheckoutSession> {
    return { url: null, providerSessionId: null };
  }

  async cancelSubscription(): Promise<void> {
    // Nothing to cancel; a Phase 09 subscription can only have been created by
    // an operator, and removing it is a database action.
  }

  async getSubscription(): Promise<ProviderSubscription | null> {
    return null;
  }

  async handleWebhook(): Promise<NormalisedWebhookEvent | null> {
    // Refusing is correct: with no provider configured there is no signature
    // to verify, and accepting an unverified event would be the vulnerability.
    return null;
  }
}

let active: BillingProvider = new NoopBillingProvider();

export function getBillingProvider(): BillingProvider {
  return active;
}

/** Phase 11 swaps the implementation here; tests use it too. */
export function setBillingProvider(provider: BillingProvider): void {
  active = provider;
}
