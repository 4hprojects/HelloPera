# Phase 5 — deferred capabilities

## Goal and entry requirements

Expand beyond free tracking only after the core product is stable and each capability has independent safety, cost and support evidence. Missing providers are not free-launch blockers while flags and reachable actions genuinely prevent their use.

Phase 1 must close the confirmation action bypass now. Atomic OCR confirmation can then be completed as an activation prerequisite. No provider selection, billing purchase flow, paid plan change or activation was performed by this audit.

## Independent feature tracks

| Canonical task                                          | Prerequisites                                                                 | Activation evidence                                                                                                  |
| ------------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [HP-020](02-prioritized-backlog.md#hp-020): OCR and AI  | HP-003 transactional confirmation, exact money, isolation, monitored quotas   | Sandbox/live contract checks, timeout/cost controls, concurrency-safe usage, human confirmation and grounded answers |
| [HP-021](02-prioritized-backlog.md#hp-021): push        | Configured VAPID, authenticated dispatch, healthy generation and real devices | Delivery, quiet hours, stale-subscription removal, retry/deduplication and safe click destinations                   |
| [HP-022](02-prioritized-backlog.md#hp-022): billing     | Separate provider selection, qualified adapter and deletion integration       | Verified signatures, lifecycle/replay/order handling, entitlement correctness, cancellation and reconciliation       |
| [HP-023](02-prioritized-backlog.md#hp-023): advertising | Publisher setup, consent/content review, qualified public placements          | No forbidden third-party request, correct consent transitions, stable layout and protected-screen exclusion          |

## Rollout contract

Qualify one capability at a time in staging with explicit test users, bounded usage and redacted logs. The release record must state configuration prerequisites, feature flag, expected benefit, success/error/cost measures, responsible role and rollback steps. Exercise disabling before enabling for users. Deactivation must not remove manual tracking, existing financial records or data export/deletion access.

OCR must never automatically turn extracted suggestions into confirmed finances. AI answers must be grounded in permitted data and cannot become a general database execution or mutation interface. Billing should implement the current provider abstraction only after the provider decision; this backlog does not invent a payment vendor or wire protocol. Advertising stays out of authenticated finance, auth and admin surfaces.

PWA offline finance storage is not implied by push support. The current service worker intentionally does not cache private data; any offline feature needs a separate data lifecycle and shared-device privacy design.

## Exit criteria per capability

- [ ] Canonical task acceptance and its dependencies are complete.
- [ ] Disabled, misconfigured, timeout and quota-exhausted paths retain usable core tracking.
- [ ] Staged enable/disable and recovery work with current deployment configuration.
- [ ] Privacy/cost/support documentation describes actual behavior and the responsible operator accepts ownership.
- [ ] The capability is released separately with dated evidence; other deferred flags stay off.

Completion of one track does not imply completion or authorization to activate the others.
