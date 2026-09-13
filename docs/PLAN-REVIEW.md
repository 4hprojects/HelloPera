# HelloPera — Planning Review

Review date: 2026-09-13
Scope: `HELLOPERA-MASTER-PLAN.md` and `PHASE-00` through `PHASE-14` (16 documents, ~25,700 lines)
State at review: no code, no repository — planning documents only

---

## Summary

The plan is unusually disciplined for pre-code work. Five decisions in particular are ones most projects get wrong and this one gets right:

- **Document / Obligation / Transaction are three separate things.** A bill is not an expense; a receivable is not income; expected income is not income. Only actual money movement creates a transaction.
- **OCR is not authoritative.** Nothing derived from a document touches a balance until a human confirms it.
- **Frontend visibility is not security.** Authorization is required at UI, route, server and database layers.
- **Forecasting is deterministic; AI only explains it.** The language model never owns an authoritative number.
- **The AI assistant gets an approved query catalog, never SQL.** Intent in, trusted code out.

The problems found are not errors of thinking. They are of three kinds: two documents that quietly disagree, a decision deferred in several places and made in none, and a later phase that depends on something an earlier phase left optional.

Counts: **9 blocking**, **9 gaps**, **10 consistency** — plus four platform
assumptions that turned out to be false once HelloDeploy's source was read
(B7a).

Severity key:

- **[B] Blocking** — will produce wrong behaviour, corrupt data, or stall a phase if built as written.
- **[G] Gap** — nothing contradicts, but something needed is missing and will surface late and expensively.
- **[C] Consistency** — drift, duplication, or naming that costs time rather than correctness.

---

## Decisions taken during this review

Three questions were open across the whole plan. They are now settled, and the phase docs have been edited to match.

| Question | Decision |
|---|---|
| How do writes reach Postgres? | **Server-only mutations.** Client RLS grants `SELECT` on own rows; every `INSERT`/`UPDATE`/`DELETE` goes through a server action that checks ownership. |
| Where is the MVP boundary? | **Phases 0–3 + 6 ship as a manual tracker.** Phases 04/05 (documents, OCR) follow as the document-intelligence upgrade. |
| Is multi-currency ever converted? | **No.** Display-only, per-currency totals, permanently out of scope. |

---

## Blocking

### B1 — The balance-effect rules are prose, not a table

`PHASE-02` §21–26 describe asset and liability behaviour through worked examples. §34 then defines the authoritative balance as depending on "account nature, transaction type, source/destination role" and stops there. §73 constrains `amount > 0`, so every sign in the system lives in logic that no document specifies.

This is the most bug-prone code in the product, and it was the least specified. A transfer from a bank account to a credit card must *decrease* both — one as an asset spent, one as a debt repaid — and nothing in the docs said so in a form an implementer could check against.

**Resolved:** `PHASE-02` now carries an explicit balance-effect matrix — (transaction type × account role × account nature) → sign — covering all six transaction types across asset and liability accounts, with the credit-card and loan cases worked through.

### B2 — Credit-card purchases were optional and mandatory in the same document

`PHASE-02` §20 said card behaviour "may be introduced carefully if supported in Phase 02". But §41 seeds `credit_card` with liability nature, and §75's own testing checklist *requires* three card behaviours to pass before the phase completes. `PHASE-03` §14 and `PHASE-06` §12 both build on it.

A phase cannot be completed when its acceptance tests exercise a feature its scope calls optional.

**Resolved:** credit-card purchases are in scope and mandatory in Phase 02.

### B3 — `opening_balance` could be counted twice

`PHASE-02` §10 puts `opening_balance` on the `accounts` table. §11 says to prefer a dedicated opening-balance *transaction*. §34 then writes the balance formula as "opening balance **/** opening transaction + all transactions" — the slash doing work no implementer can resolve.

If both exist and both are summed, every account is wrong from the first day, in a way that reconciles against nothing.

**Resolved:** the opening-balance transaction is authoritative. `accounts.opening_balance` is input-only, retained for display and audit, and never summed.

### B4 — Refunds were both excluded from expenses and netted against them

`PHASE-06` §12 lists refunds under "Exclude" when computing monthly expenses. §14 then specifies a `Gross Expenses / Refunds / Net Expenses` presentation. If refunds are excluded from the expense figure, there is nothing for the net line to net.

**Resolved:** refunds are excluded from income (they are not earnings), netted *within* the expense figure, and shown as their own line so the gross and net are both legible.

### B5 — Adjustments need a `direction` the schema did not have

`PHASE-02` §28 requires a "Direction" on every adjustment, and §48's form collects it. The `transactions` table in §17 has no such column, and §73 forbids a negative `amount`. An adjustment therefore had no way to express which way it moved the balance. Refunds have the same latent issue.

**Resolved:** `direction` added to the transactions specification, with its permitted values and the types that require it.

### B6 — "Trusted flow" was not enforceable as written

`PHASE-02` §56 permits users to "INSERT own through trusted flow" and says direct writes to balance-sensitive fields "should be restricted if possible". `PHASE-04` §51 and `PHASE-05` §76 say the same about processing status and job state.

With the Supabase anon key, the browser reaches PostgREST directly. RLS cannot distinguish a call from your service layer from a `fetch` typed into devtools. "Through trusted flow" is not a condition the database can evaluate, and "if possible" is not a security control.

**Resolved:** client RLS is `SELECT`-only on own rows across every user-owned table; all mutations go through server actions. Stated once in the master plan and referenced from phases 01–13 rather than restated with variations.

### B7 — HelloDeploy is load-bearing and undefined

HelloDeploy appears in all 16 documents as the compute platform. Nothing states what it is or what it supports. Later phases silently assume:

| Assumption | First needed | Cited in |
|---|---|---|
| Native module support (Sharp binaries) | Phase 04 | P04 §48 |
| Writable temp directory | Phase 04 | P04 §45 |
| Node runtime, not Edge | Phase 04 | P04 §47 |
| Request bodies to 20 MB | Phase 04 | P04 §16 |
| Long-running requests (OCR) | Phase 05 | P05 §47 |
| Scheduled invocation / cron | Phase 07 | P07 §20, P08 §34 |
| Inbound webhooks through Cloudflare | Phase 11 | P11 §70 |
| A Postgres connection mode that survives it | Phase 14 | P14 §36 |

Each is discovered at the phase that needs it. The cron assumption is not tested until Phase 07 — by which point six phases sit on the platform. If HelloDeploy cannot run scheduled work, Phases 07, 08, 11 and 14 all need redesign after the fact.

This is the largest unpriced risk in the plan.

**Resolved:** `PLATFORM-HELLODEPLOY.md` records every assumed capability, the phase that needs it, how to verify it, and the fallback if it is absent.

### B7a — The matrix was then verified, and four assumptions failed

HelloDeploy turned out to be the user's own project, sitting beside this one
at `~/Documents/MyProjects/HelloDeploy`. Reading its source settled the matrix
from evidence rather than guesswork — and confirmed this was the right risk to
front-load:

| Assumption | Reality | Consequence |
|---|---|---|
| Scheduled jobs (row S1) | **Not available** — explicitly deferred in its blueprint, along with worker products | Phases 07, 08, 11 need `pg_cron` or an in-process scheduler |
| 20 MB PDF uploads (row Q1) | **10 MB** — nginx `client_max_body_size 10m` | Phase 04 limits lowered to 8 MB |
| Synchronous OCR (row Q2) | **60s ceiling** — nginx `proxy_read_timeout 60s` | Phase 05 goes async from the start |
| PDF page rendering (row I3) | **Impossible** — the Dockerfile is platform-generated; no poppler or pdfium | OCR provider must accept PDFs natively |

Plus one hazard the matrix predicted only in the abstract: the image is
`node:22-alpine` (musl, not glibc) shipping `.next/standalone`, which traces
dependencies. **Sharp is at risk on both counts simultaneously** — a clean
build that fails at the first upload. Phase 00 must deploy a route that
actually calls Sharp, not merely compile one.

Had the matrix not been written, S1 would have surfaced in Phase 07 with six
phases already built on the platform, and the Sharp problem in Phase 04 as an
inexplicable runtime error.

Verified rows: 16 of 26. Four unavailable or constrained, one at risk, five
optional or deferred.

### B8 — The light-theme palette fails WCAG AA as text

Measured contrast against Mist `#F4F8F7`:

| Token | Hex | Ratio | AA body (4.5:1) |
|---|---|---|---|
| Deep Ink | `#132238` | 14.93:1 | pass |
| Danger | `#C94F5C` | 4.12:1 | **fail** |
| Primary Jade | `#138A72` | 4.00:1 | **fail** |
| Muted Text | `#6F7C87` | 4.00:1 | **fail** |
| Success | `#2E9B62` | 3.28:1 | **fail** |
| Warning | `#D58A34` | 2.61:1 | **fail** (also fails 3:1 large text / UI) |
| Gold Accent | `#C9963E` | 2.48:1 | **fail** (also fails 3:1 large text / UI) |

Every semantic colour fails as body text, and `PHASE-02` §69 assigns exactly these to income, expense, transfer and adjustment *amounts* — which are text, and are the most important text in a finance app. Muted Text is the clearest miss: a token whose only role is text, at 3.97:1.

Separately, white on Primary Jade `#138A72` is 4.28:1 — so a primary button with a normal-size label also fails.

The dark theme is fine: Jade `#2CB89A` on `#0B1420` is 7.4:1.

**Resolved:** the brand hexes are kept for fills, borders, chart marks and large display figures. A parallel set of `-text` tokens, each verified above 4.5:1, is added for text and for button fills. Dark-theme semantic colours — absent entirely from the original palette — are specified too.

### B9 — Backups and account deletion arrived after real money and real users

`PHASE-10` publishes a public site for AdSense review. `PHASE-11` charges real cards. Backup confirmation, a *tested* restore, rate limiting, secret rotation, data export and account deletion all sit in `PHASE-14`.

Meanwhile `PHASE-01` §38 defers deletion ("may remain disabled"), master plan §47 lists it under "eventually", and `PHASE-10` §45 requires the privacy policy to describe deletion — which, at that point, would not exist. The plan would have the product take payments and hold financial documents for four phases before anyone verifies a backup can be restored.

**Resolved:** a pre-public-launch gate — working backup, *tested* restore, account deletion, data export, rate limiting on auth endpoints — must pass before Phase 10 publishes anything.

---

## Gaps

### G1 — The over-allocation guard has no named mechanism

`PHASE-03` §37 concedes "database constraints alone may not be enough". §74 poses the exact race: a bill with ₱1,000 remaining, two ₱1,000 payments arriving together, both must not succeed. Four phases depend on this holding, and all four say "use a database transaction", which is not a mechanism.

**Resolved:** named once — allocation runs inside a `plpgsql` function that takes `SELECT … FOR UPDATE` on the obligation row before reading the remaining balance. Phases 03, 05 and 07 reference it.

### G2 — `audit_logs` was specified twice, differently

`PHASE-01` §40: `actor_user_id, target_user_id, event_type, metadata, created_at`.
`PHASE-02` §30 adds: `entity_type, entity_id, before_data, after_data`.

Phase 01 says the table "may be created now or in Phase 02". Created in Phase 01 as specified, Phase 02 needs an `ALTER` on its first day.

**Resolved:** Phase 01 creates the table with Phase 02's superset shape, restricting only which event types it writes.

### G3 — OCR retry could outlive its source

`PHASE-04` §26 recommends deleting the original after OCR succeeds, leaving a display WebP at 1800px / quality 85. `PHASE-05` §62 then warns to "ensure WebP compression has not damaged text", §43 offers the user a retry, and `PHASE-13` §27 gives admins a retry button — each potentially running against a degraded source, or none at all.

**Resolved:** retention is tied to extraction state. The OCR-quality source survives until the extraction is confirmed or discarded; retry checks `retention_status` first and fails with a clear message rather than silently producing worse results.

### G4 — PDF page rendering is an unvetted native dependency

`PHASE-04` §27 defers page rendering to Phase 05 "if OCR requires it". `PHASE-05` §63 then requires rendering pages whenever the provider lacks native PDF support. Phase 04's deployment gate validates only Sharp — so a second native dependency (poppler, pdfium or equivalent) would be discovered in Phase 05, on the platform that is itself unverified (see B7).

**Resolved:** added to the Phase 04 deployment gate alongside Sharp, with the alternative recorded — choose an OCR provider with native PDF support and skip the dependency entirely.

### G5 — Phase 06 depended on Phase 05 for nothing it used

`PHASE-06` §2 lists "OCR-confirmed records" and "Document links" as required inputs. Every query in the document reads confirmed transactions, bills, receivables and expected income — all of which exist at the end of Phase 03. The dependency was assumed, not real.

**Resolved:** removed. This is what makes the earlier ship gate possible: Phases 0–3 + 6 are a complete manual finance tracker.

### G6 — No test tooling, anywhere

All 16 documents carry manual checkbox lists. No phase introduces a test framework. `PHASE-14` §11 then requires `tests` in the pre-deployment gate, with nothing to run.

The balance engine, transfer atomicity, void-and-edit reversal, and allocation caps are precisely the code that needs automated coverage — they are pure logic, they are where money is lost, and manual checklists will not catch a regression six phases later.

**Resolved:** the harness is introduced in Phase 02 alongside the balance engine, with required coverage named.

### G7 — No consolidated data model

Twenty-plus tables are defined as prose blocks scattered across ten phase documents, and several are extended later: `documents` gains OCR fields, `bills` gains `recurring_rule_id`, `transactions` gains transfer and refund links. Master plan §50 lists table names only — no columns, no relations.

**Resolved:** `DATA-MODEL.md` consolidates every table, the phase that creates it, and the phases that extend it.

### G8 — `profiles` had no timezone or currency

`Asia/Manila` is asserted as the user-facing default in phases 02, 03, 06, 07, 08, 09 and 12 — each adding "user-configurable later", and no phase adds it. `PHASE-08` §8 puts `timezone` on `notification_preferences`, which would leave the value living in the notification table while analytics month boundaries, bill due-date comparisons and forecast dates all need it too.

**Resolved:** `timezone` and `default_currency` added to `profiles` in Phase 01. Nearly free now; a migration across seven phases' worth of date logic later.

### G9 — AdSense consent for EEA traffic

`PHASE-10` §49 models `necessary / analytics / advertising` consent categories, which is the right shape. It does not mention that Google requires a certified Consent Management Platform to serve ads to EEA and UK users.

**Resolved:** named in Phase 10, with the alternative recorded — scope EEA traffic out at launch and revisit.

---

## Consistency

| # | Finding | Resolution |
|---|---|---|
| C1 | Master plan §52 gives a `File:` block for phases 0–6 only; 7–14 have none, though the files exist. | Blocks added for 7–14. |
| C2 | Master plan §53 mandates an 18-section structure for every phase doc. No phase doc follows it; "Components" and "Server Actions / APIs" are absent from most. | Standard relaxed to the structure the docs actually use well. Retrofitting 15 documents to a structure that was never followed buys nothing. |
| C3 | `ads_enabled` is a per-user entitlement (P09 §27); `ads_enabled_global` is a kill switch (P10 §54, P13 §33). One word of context apart, opposite meanings. | Entitlement renamed `ads_shown`. |
| C4 | `PHASE-03` §29 lists expected-income statuses without `partially_received`; §34 adds it. | Reconciled in the schema block. |
| C5 | `PHASE-03` §8's `bills.status` column never states its persisted enum, while §9 splits persisted from derived. | Persisted set stated in the schema block. |
| C6 | `PHASE-08` §17's dedupe key (`bill:<id>:due_soon:<date>`) has no escalation component, so §48's 1/7/30-day overdue ladder either fires hourly or exactly once, forever. | Key shape made per-type and escalation-aware. |
| C7 | `PHASE-00` §7 defines `--color-primary` and a separate `--color-primary-dark`, forcing every component to know the active theme — contradicting §7's own "components should use semantic tokens" and §11's "do not deeply couple components to one theme". | One set of semantic names, redefined under `[data-theme]` and `prefers-color-scheme`. |
| C8 | No WCAG level is named anywhere, though nine documents require accessibility. | WCAG 2.2 AA set in the master plan. |
| C9 | `PHASE-09` §24 proposes a 12-month Premium forecast; `PHASE-07` §34 builds 30/60/90 and notes longer horizons are less reliable. The Premium tier would sell something that does not exist. | Premium capped at the horizon Phase 07 builds. |
| C10 | `repositories/` is introduced in P02 §39 then immediately hedged — "may remain thin", "avoid unnecessary abstraction". | Dropped. Services only. A layer that the document itself argues against is a layer that will be inconsistently used. |
| C11 | Usage-counting rules say "document exact rule" in P09 §17, P09 §18 and P12 §41, and never do. | Decided once in Phase 09; Phase 12 references it. |
| C12 | FX deferred in P02 §61, P03 §71, P06 §29, P07 §46 and P12 §32 — five forward references, no owner. | Stated as a permanent product decision in the master plan. |

---

## What was already right

Worth recording, so it does not get "simplified" later by someone who did not see the reasoning:

- **`PHASE-05` §4** — the refusal to let OCR write a balance. This is the single most important rule in the product and it is stated unambiguously.
- **`PHASE-12` §4 and §66** — the AI never returns executable SQL; intents map to developer-written code. This makes prompt injection a non-event rather than a breach, as §45 notes.
- **`PHASE-03` §36** — link tables with `amount_applied` on both sides, so one transaction can settle several obligations and one obligation can take several transactions. Correct from the start; retrofitting this is painful.
- **`PHASE-02` §5** — ten numbered integrity rules, including that balances must be *derivable* from transactions. The recalculation function in §36 is what makes cached balances safe.
- **`PHASE-09` §53** — entitlement resolution fails closed to Free. A monetization bug should not hand out Premium.
- **`PHASE-13` §59** — admin impersonation rejected by default, with conditions listed if it is ever added.
- **`PHASE-10` §7 and §61** — ad placement rules written to protect the user from misclicks near financial controls, not to maximise revenue.
- **`PHASE-05` §68** — explicit refusal to claim the OCR model learns from user corrections. Honest about what the system does.

---

## Suggested reading order for implementation

1. `HELLOPERA-MASTER-PLAN.md` — product identity and the cross-cutting rules
2. `PLATFORM-HELLODEPLOY.md` — verify before writing code
3. `DATA-MODEL.md` — the shape everything else refers to
4. `PHASE-00` → `PHASE-03`, then `PHASE-06` — the shippable manual tracker
5. `PHASE-04` → `PHASE-05` — the document-intelligence upgrade
6. `PHASE-07` onward, in order
