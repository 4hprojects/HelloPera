/**
 * Model configuration — PHASE-12 §7.
 *
 * "Do not hardcode model identifiers throughout business logic. Use
 * configuration." So the identifiers live here, once, and are overridable by
 * environment without a code change — which is what makes swapping a model
 * for cost or latency (§7's own criteria) a deployment decision rather than a
 * pull request.
 *
 * Two models rather than one, because the two calls have genuinely different
 * requirements. Intent parsing is a short, schema-constrained classification
 * where reliability matters and latency is felt directly by someone watching a
 * spinner. Explanation is prose over figures that have already been computed,
 * where nothing is at stake but phrasing.
 */

/** Structured intent parsing (§8). */
export const INTENT_MODEL = process.env.AI_INTENT_MODEL || 'claude-opus-5';

/** Grounded explanation (§8, §22). */
export const EXPLANATION_MODEL = process.env.AI_EXPLANATION_MODEL || 'claude-opus-5';

/**
 * Output ceilings.
 *
 * The intent plan is a handful of short fields; a budget larger than that buys
 * nothing and pays for runaway output. The explanation is deliberately tight
 * too — §22 wants an explanation of figures, not an essay, and a cap is the
 * bluntest way to keep the answer the size a phone screen wants.
 */
export const INTENT_MAX_TOKENS = 1024;
export const EXPLANATION_MAX_TOKENS = 700;

/**
 * §57 — how long a question may take before the user is told it failed.
 *
 * Beyond this the answer has stopped being useful: someone looking at a
 * loading state for half a minute has already decided the feature is broken.
 * Failing at a known point with an honest message and an intact set of manual
 * analytics (§93) is better than an open-ended wait.
 */
export const AI_TIMEOUT_MS = 20_000;
