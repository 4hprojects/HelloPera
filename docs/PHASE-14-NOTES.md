# Phase 14 — implementation notes

What was built, what was deliberately left, and the decisions a reader of
`PHASE-14-PRODUCTION-HARDENING.md` would otherwise have to reverse-engineer.

Phase 14 has 107 sections and splits roughly 60/40 between application code and
work that needs accounts only the operator can open. This pass took the
launch-critical code. What was not taken is listed in §9, with reasons.

---

## 1. The check that could not report

`check_balance_integrity()` shipped in Phase 02 to detect balance drift. It
called `recalculate_account_balance()`, whose last statement is
`update public.accounts set current_balance = ...`. Its own comment was candid
about it: *"Recalculating repairs as it reads, so run it to both detect and fix
drift."*

In Phase 02 that was a reasonable thing to ship, because nothing was watching
and self-healing beat silent corruption. §65 makes it wrong: *"It should report
mismatches. Do not silently modify data without controlled repair."*

The deeper problem is not the rule, it is what the behaviour costs. **A checker
that repairs destroys the evidence of what it found.** Nobody can afterwards
answer how often drift happens, to which accounts, or after which operation —
so a real bug in the balance engine produces exactly the same observable as a
system working perfectly. A finance application that silently self-corrects is
one where the most important class of defect is invisible by construction.

The fix is a split rather than a rewrite:

| Function | Does |
|---|---|
| `derive_account_balance()` | The §34 matrix. Returns a number. Writes nothing. |
| `recalculate_account_balance()` | Calls derive, writes the cache. Unchanged for every existing caller. |
| `check_balance_integrity()` | Calls derive. Reports. Never writes. |

One copy of the arithmetic instead of two, which also means
`lib/finance/sql-parity.test.ts` guards one thing rather than needing to guard
both. Only that test's doc comment had to follow the move — it transcribes the
SQL by hand rather than grepping the file.

**Proved, not argued.** The verification corrupts a balance directly and asserts
the check reports the drift *and leaves it there*. The old function would have
passed that test by fixing the row, which is precisely the point.

## 2. Why maintenance mode is not a feature flag

This is the one place the codebase deliberately breaks its own convention.
Every other switch is a `feature_flags` row, and Phase 13 built a write path
specifically so operators would not need SQL.

Two reasons this one is an environment variable:

- **The situation it exists for.** The usual cause of entering maintenance is
  that *the database is the problem* — a migration half-applied, a pool
  exhausted, a restore running. A maintenance switch stored in that database is
  unreadable at exactly the moment it is needed. A switch that requires the
  thing it protects to be healthy is not a switch.
- **Cost.** It is checked in middleware, on every request. A flag read there
  would buy a Supabase round trip on every page load, forever, to answer a
  question whose answer is "no" essentially always.

`financial_writes_enabled` is the opposite case and stays a flag: read only at a
write, and used when the database is *fine* but something else is not.

Two details that matter:

- `isMaintenanceMode()` accepts only `1` or `true`. A truthiness check on the
  raw string would take the site down for `MAINTENANCE_MODE=false`, which is
  exactly what a nervous operator types.
- `/api/health` is exempt from maintenance, or the platform's own probe would
  read a maintenance page as a healthy response and never restart anything.

## 3. The freeze is enforced at the write, not in the UI

`assertWritesEnabled()` is called in all nine finance and obligation actions.
Not in the components: a disabled button is a suggestion that anyone with the
page already open, or anyone posting to the action directly, never receives.

`recordPaymentAction` nearly escaped. It destructures `{ user, profile }` rather
than `{ user }`, so the pattern that inserted the other eight guards did not
match it — and recording a payment is a financial write in the most literal
sense. Every action is now enumerated and checked rather than assumed.

**It fails open**, which is the opposite of how entitlements fail and
deliberately so. `isFlagEnabled` returns false for an unreadable flag; for this
flag that would mean an unreachable `feature_flags` table silently freezing
every user's ability to record a transaction. Locking people out of their own
finances because an operational table hiccuped is worse than briefly honouring a
freeze less strictly than intended.

## 4. Liveness and readiness answer different questions

`/api/health` touches nothing. A liveness probe that depends on the database
reports the *process* as dead when a dependency is unwell — and the platform's
response to a dead process is a restart, which cannot fix a database. That is
how one slow query becomes a restart loop.

`/api/health/ready` checks the database and storage, with a 3-second timeout so
a hung dependency fails the check rather than hanging the probe. It deliberately
does **not** check OCR, AI or billing: those are not required to serve a
request, and a readiness probe that fails on a third party's outage pulls every
instance out of rotation over a feature most requests never touch.

§32 — neither endpoint reveals a version, a commit, a hostname or an error
string. The detail goes to the log, where an operator can see it and a stranger
cannot. These are public URLs, so everything they say is said to everyone.

## 5. A decision reversed mid-implementation

The plan said to delete `/api/platform-check`, on the strength of its own Phase
00 comment: *"Remove or fold into the real image service in Phase 04."*

I deleted it, then found three documents citing it, and restored it. It answers
a question the health endpoints deliberately do not: does Sharp's musl binary
load in the container that was actually built. Uploading a real document would
also exercise Sharp — but only once the database, storage and auth are all
working, which is exactly when a compound signal is least useful. It costs one
route. The stale TODO was not a good enough reason to remove a working
diagnostic that `PLATFORM-HELLODEPLOY.md` tells you to use.

## 6. CSP ships report-only, which is not a half-measure

`docs/CSP-NOTES.md` recorded three deferrals and the header to ship. Its two
blockers are still real — AdSense origins cannot be verified without an account,
and nothing has run behind the production domain.

Report-only is what that note prescribes, and it is useful on its own:
violations appear in every visitor's console from the first deploy, which is the
data needed to enforce with confidence. Going straight to enforcement is how a
CSP silently breaks a page in a browser nobody tested.

One deviation from the note: the Supabase origin is derived from
`NEXT_PUBLIC_SUPABASE_URL` at build time rather than written as
`<ref>.supabase.co`. A placeholder committed into a header is a CSP that blocks
the database on the first deploy to any other project. Verified against a
running server — the header carries the real host.

HSTS ships enforcing, since it has no such blocker. It is worth knowing it is
hard to undo: a browser that has seen it refuses plain HTTP for the full
`max-age`. That is the point, and also why the domain should be settled first.

## 7. Rate limits on what was still uncovered

Three endpoints had none, for three different reasons:

- **OCR submission** spends real money per call. The monthly quota bounds the
  bill; this bounds the burst, which is what a script produces before anyone
  notices. Placed *before* the quota gate, so a refused burst does not consume
  one of the user's scans.
- **The billing webhook** is a public POST whose only protection is a signature.
  Verification is not free and an attacker does not need to pass it to make us
  pay for it. The limit is deliberately generous — a provider recovering from an
  outage delivers a backlog at once, and a refused webhook is a subscription
  that silently stops matching reality.
- **The scheduler** is a public POST whose only protection is a secret. The
  comparison is already constant-time, so this is not about timing: it turns an
  unbounded online guessing attack into a bounded one.

§39's line holds throughout — these are technical limits, never plan quotas.

## 8. Retention is built and switched off

§73 wants real periods and says the policy must match the privacy page. No
policy exists, and Phase 12 §19 already says retention must not be destructive
without one.

So `run_retention_cleanup()` is written, tested, scheduled nightly — and refuses
to do anything while `retention_enabled` is off, which is how it ships. A
disabled run creates no `job_runs` row at all, because it did no work.

Periods are parameters with conservative defaults rather than decisions.
Inventing a number would put the application in contradiction with a published
promise, which is worse than deleting nothing.

What it would delete, recorded so the decision can be made concretely:

| Step | Removes | Why it is the safe end of the range |
|---|---|---|
| `expired_notifications` | notifications past `expires_at` | Derived from bills and balances that still exist |
| `ocr_text` | `ocr_results.raw_text` only | The extracted fields and the document survive; the verbatim transcription is the most sensitive artefact OCR produces and the least useful to keep |
| `inactive_push` | repeatedly-failing subscriptions | A dead device, not user data |

Documents are deliberately absent. `document_retention_days` is an entitlement
users are sold on, so expiring their receipts is a product decision rather than
an operational one.

Scheduling a disabled job is intentional: turning retention on becomes one flag
in the admin UI rather than a migration, and the schedule has been exercised by
then.

## 9. What was not taken, and why

**Needs your accounts** (§4–21, §24, §41–42, §45, §86–88, §97–101): backups and
restore testing, a staging project, error monitoring, Cloudflare, the domain,
uptime alerts, cost reviews. Several are already open items in
`LAUNCH-CHECKLIST.md` §1.

**Deferred by choice**: log enrichment with request ids (§25–27), JSON and ZIP
export (§67–68), incident runbooks (§80–84), and the review sections (§46–52).
Real work, lower value per line than the above, and better done once something
is actually running and producing the logs and incidents they are about.

## 10. Verification, and its honest gap

- **17 integrity checks** against a real Postgres: drift reported and left in
  place; repair fixes it and reports what changed; over-allocated obligations,
  orphaned document links and stale subscriptions all detected; the nightly job
  counts mismatches into `job_runs` and repairs nothing; none of the new
  functions is callable by a browser.
- **10 retention checks**: disabled by default, refuses to run, deletes nothing,
  leaves no job row — then works correctly once enabled.
- **Headers and maintenance mode against a running server**: report-only CSP
  with the real Supabase origin, HSTS, the four existing headers unchanged; a
  503 maintenance page with `retry-after` while `/api/health` stays 200.
- **Readiness against the live project**: database and storage both reachable.
- 676 tests, build clean, 24 migrations from scratch.

**Not done:** no admin page has been rendered in a browser, `/admin/integrity`
included. They need an admin session, and the remote database is still eleven
migrations behind. Same gap `LAUNCH-CHECKLIST.md` §14 records for every
signed-in page since Phase 07.
