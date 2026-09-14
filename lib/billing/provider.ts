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
 * A payment, in HelloPera's terms — PHASE-11 §34, §37, §38.
 *
 * The adapter converts the provider's invoice into this before the domain
 * sees it. Note what is absent: no card number, no last four, no expiry, no
 * bank details. §38 and criterion 24 forbid storing them, and the way to keep
 * that promise is to leave no field they could be written into.
 */
export type NormalisedInvoice = {
  providerInvoiceId: string | null;
  providerPaymentId: string | null;
  /** Decimal string, not a float. Money never round-trips through a double. */
  amount: string;
  currencyCode: string;
  status: 'paid' | 'failed' | 'refunded' | 'pending';
  periodStart: string | null;
  periodEnd: string | null;
  receiptUrl: string | null;
};

/**
 * A webhook already verified and normalised by the adapter.
 *
 * The adapter owns signature verification: it is the only layer that knows
 * what the provider signs and how.
 *
 * `eventType` is expected to be one of `BillingEvent` (lib/billing/lifecycle).
 * Mapping the provider's vocabulary onto it is the adapter's job — §40 — so
 * that nothing downstream ever switches on a provider's string. An event this
 * application does not model is recorded and ignored rather than guessed at.
 *
 * `subscription` and `invoice` are the two things a handler would otherwise
 * have to dig out of `payload` itself, which would put provider-shaped parsing
 * back into the domain. `payload` remains, unparsed, purely as the audit
 * record of what actually arrived.
 */
export type NormalisedWebhookEvent = {
  providerEventId: string;
  eventType: string;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  /** Period and cancellation state as of this event, when the event carries it. */
  subscription?: ProviderSubscription | null;
  /** Present only on payment events. */
  invoice?: NormalisedInvoice | null;
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
