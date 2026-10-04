# Phase 1 — correctness and security

## Goal and entry requirements

Ensure that every supported write has the correct authorization, exact money representation, retry behavior and incident controls. Start from the audited baseline with Node 22 and preserve the pre-existing rate-limit diff. Read the installed Next.js data-security/authentication guides and repository Supabase skills before implementation. Database changes require forward migrations, explicit grants and corresponding data-model updates.

Provision staging under [HP-016](02-prioritized-backlog.md#hp-016) while local fixes proceed. Hosted validation waits for verified staging identity, not for production access.

## Implementation sequence

| Order | Canonical tasks                                                                        | Deliverable                                                        |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 1     | [HP-001](02-prioritized-backlog.md#hp-001), [HP-002](02-prioritized-backlog.md#hp-002) | Reviewed framework patch and consistent download authorization     |
| 2     | [HP-004](02-prioritized-backlog.md#hp-004), [HP-005](02-prioritized-backlog.md#hp-005) | Canonical input and exact decimal transport contracts              |
| 3     | [HP-025](02-prioritized-backlog.md#hp-025), [HP-003](02-prioritized-backlog.md#hp-003) | Effective financial freeze and closed extraction write bypass      |
| 4     | [HP-006](02-prioritized-backlog.md#hp-006), [HP-007](02-prioritized-backlog.md#hp-007) | Retry-safe ordinary creation and consistent analytics snapshots    |
| 5     | [HP-008](02-prioritized-backlog.md#hp-008), [HP-026](02-prioritized-backlog.md#hp-026) | Complete authorization matrix and durable privileged audit records |

HP-003 has two gates: deny unsafe confirmation before free launch; complete transactional confirmation before OCR activation. Its launch closure must explicitly identify which part is completed and retain the activation work under Phase 5. This avoids making an unused provider feature a requirement for free tracking while still closing its reachable action boundary.

## Interfaces and migration constraints

- Preserve public route URLs and ordinary successful user outcomes. Add request IDs to creation inputs rather than infer identity from transaction contents.
- Money read DTOs must contain exact decimal strings; TypeScript casts alone are insufficient. Keep currency explicit throughout.
- Prefer invoker-security read RPCs; privileged mutation RPCs must validate ownership and remain inaccessible to anon/authenticated roles where the current architecture requires service-only writes.
- Introduce new migrations instead of rewriting applied migrations. Review deployment ordering and compatibility with the preceding application version before release.
- Preserve deletion freeze, export completeness, over-allocation rejection and currency separation while changing shared boundaries.
- Fail closed when the financial-write switch cannot be read. This is an explicit policy choice correcting the current contradictory comments; unrelated reads should remain available.

## Verification and exit criteria

- [ ] Current dependency advisory addressed and complete local checks pass.
- [ ] Active/verified status, role and ownership checks cover direct requests, not only page navigation.
- [ ] Accepted amount/date inputs match persistence contracts; numeric boundaries survive the HTTP read path.
- [ ] Retries, concurrent submissions and interrupted responses produce one intended ledger effect.
- [ ] Analytics reconciliation remains correct during controlled concurrent writes.
- [ ] All financial mutation paths and scheduled generators obey the freeze; audit failure cannot silently lose the reason for a privileged database change.
- [ ] Relevant isolated database tests and hosted staging cases have dated evidence for the changed SHA.

Tests must exercise behavior and fault boundaries. Do not mark this phase complete merely because pre-existing tests still pass. Any confirmed cross-user leak or data-loss incident discovered during implementation becomes P0 and blocks release immediately.
