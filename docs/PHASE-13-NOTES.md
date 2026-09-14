# Phase 13 — implementation notes

What was built, what was deliberately not, and the decisions a reader of
`PHASE-13-ADMIN-OPERATIONS.md` would otherwise have to reverse-engineer.

---

## 1. The problem the phase actually solves

Criterion 22: *"the system is operationally supportable without direct database
editing for routine tasks."* Before this phase it was not, in a specific and
easily overlooked way — **there was no admin mutation surface anywhere.** No
`app/actions/admin.ts`, and `feature_flags` had a reader (`isFlagEnabled`) with
no corresponding write path since Phase 09 created it. Suspending a user or
flipping a kill switch meant opening the SQL editor.

That is not merely inconvenient. A kill switch you can only reach through a SQL
console is one you will not reach during the incident it exists for.

## 2. Why the guard could not stay in the layout

§70 asks for `requireAdmin()` on every request, *not only at the layout*, and
the distinction is not pedantry.

A Next.js layout renders once for a page and does not run again when a server
action is invoked from it. A layout-only guard therefore protects the **view**
and leaves every **mutation** reachable by anyone who can POST to the action's
endpoint — which is a public URL, discoverable in the client bundle.
`app/admin/layout.tsx` guards the screens; `lib/auth/admin.ts` guards the
actions. Two different problems that look like one.

## 3. Authorization and auditing are the same call

§53 requires every admin action to be audited and §54 requires a reason. Those
could be three calls in each action — authorise, do, record — and across a
dozen actions one of them would eventually be forgotten. It would be the audit,
reliably, because nothing fails when it is missing.

So `adminAction()` takes the event name and the reason as arguments and writes
the record itself. The only way to skip the audit is to skip the authorization,
which fails loudly. The record is written *after* the work succeeds: a log of
something that did not happen is worse than a missing one, because it sends the
next person looking for a cause that never existed.

## 4. The privacy boundary is asserted, not promised

§4 — *"Admin can manage the platform without reading private user financial
content"* — is restated by criteria 8, 10, 20 and 21. It is a property of what
the admin service selects, and it decays quietly: a future page needs one more
field, an admin client is already in scope, and the query is three lines long.
No test goes red.

`services/admin.privacy.test.ts` reads the service source and asserts:

- `transactions`, `accounts` and `documents` are touched only with
  `head: true` counts — the rows never leave the database;
- `ocr_results`, `extraction_results`, `ai_conversations` and `ai_messages` are
  not read at all;
- notification queries never select `title` or `message`, which are assembled
  from someone's own bills and balances;
- `select('*')` appears nowhere, since that is how a column added next year
  becomes visible to admins without anyone deciding it should.

It is a coarse check — it reads text and cannot understand intent — but it is a
tripwire on exactly the change that would otherwise pass unnoticed, and a
deliberate exception now has to be argued for in a diff. I confirmed the matcher
finds real selects rather than passing vacuously, which is the failure mode a
source-reading test has.

Two Phase 12 decisions pay off here: the AI screen *cannot* show a question
because `ai_usage_logs` has no column holding one, and the OCR screen cannot
show document text because it lives in `ocr_results`, which nothing reads.

## 5. No escalation path, on purpose

§26 and §29 suggest an audited, time-limited mechanism for inspecting document
or prompt content when support requires it. This build has none, and that is a
decision rather than an omission.

A half-built escalation — one without real time limits, or whose audit trail
nobody reads — is worse than none, because it converts a deliberate act into a
routine one while looking like a control. The database owner reaching for psql
is itself the "explicit and non-routine" property §26 is describing. When there
are users to support and a real pattern of need, the mechanism can be built
against that pattern rather than guessed at.

## 6. Overrides had to be wired in, or they are decoration

`entitlement_overrides` is the point `DATA-MODEL.md` makes about all three new
tables: *"they exist to avoid falsifying primary records."* Promotional Premium
is an override row, not a subscription invented to look like a purchase.

But a table nothing reads grants nothing. The wiring turned out to be almost
free: `resolveEntitlements()` already reduces `{entitlement_key, value_json}`
rows into a `Map` where a later row wins, and `entitlement_overrides` was
specified with that exact shape. So overrides in effect are appended after the
plan's rows — one resolver, so the two answers cannot drift — and an override
applies to exactly the keys it names, leaving the rest of the plan alone.

Two properties worth naming:

- **A failed override read leaves someone on their plan**, never strips it.
  That is §53's "a failure grants Free, never nothing" applied one level down.
- **An override can restrict as well as grant.** Abuse mitigation is the other
  direction, and it works the same way.

Revoking sets `ends_at` rather than deleting the row, because the row is the
record of *why* a grant was made. Deleting it would erase the reason along with
the effect — the same mistake as writing the grant into `subscriptions`.

## 7. The self-escalation trigger, and what it honestly does

`profiles` has a trigger refusing client-side changes to `role` and `status`.
Today it **cannot fire from a browser**: `authenticated` holds only `SELECT` on
that table, so there is no client UPDATE to intercept.

It is written anyway, and the reason is worth stating without overselling. "No
write path exists" is a property of the *grants*, and grants change. The obvious
future change — letting people edit their own name without a round trip through
a server action — is one `grant update` away, and it would silently hand every
user `role` and `status` as well.

The test simulates exactly that grant rather than shipping the guard untested,
and doing so caught that my first version asserted nothing: it set `status` to
the value the row already held, which is not a change, so the trigger correctly
allowed it. It now suspends the user first and checks they cannot reactivate
themselves — which is the scenario that actually matters.

## 8. Content stays in the repository

§37 and §38 describe draft/edit/publish/archive from the admin UI. Phase 10
shipped guides as files under `content/guides/` with a draft/published registry,
and `allGuides()` was already documented as the non-public view of them.

A database-backed editor would create a second content system: two places a
guide can live, two sources of truth for whether it is published, and a new way
for the sitemap and the page to disagree. Editing a guide stays a commit, which
brings version history, review and rollback for free — none of which a CMS text
field would.

So `/admin/content` answers the question an operator actually has of a screen:
what is live right now, and is anything stuck in draft.

## 9. Health from traffic, not from a probe

§30 asks for Operational / Degraded / Unavailable. `healthFrom()` derives it
from the failure rate over recent real requests rather than a synthetic probe,
because a probe tells you whether the provider answers a request nobody asked
for, and the failure rate tells you whether it answered the ones people did.

Two deliberate behaviours:

- **No traffic reads as operational, not degraded.** A quiet hour is not an
  outage, and an indicator that cries wolf at 3am is ignored by the time it
  matters.
- **An unconfigured provider reads as "not configured", never "operational".**
  A green light for something that cannot run is worse than no light, because
  it gets believed.

## 10. What is deliberately not here

- **OCR retry execution** and **billing event replay.** The gating is code; the
  execution needs `ANTHROPIC_API_KEY` and a payment adapter. The screens say so
  rather than offering a button that fails.
- **MFA** (§58) — deferred to Phase 14 by the phase document itself.
- **Impersonation** (§59) — explicitly forbidden, not merely skipped.
- **Private-content escalation** (§26) — see §5 above.

## 11. Verification, and its honest gap

- 23 schema checks against a real Postgres (`embedded-postgres`, 21 migrations
  from scratch): all three tables refuse SELECT, INSERT and UPDATE for the
  browser role — including an admin's own session, because admin is a role in
  the application and not a database grant; every constraint rejects what it
  should; the migration re-runs without destroying rows; deleting a user clears
  their rows while deleting an admin keeps the notes with a null author.
- 9 privacy assertions over the service source, plus 3 on provider health.
- 9 override tests covering precedence, expiry, unparseable windows, per-key
  fallback on a corrupt value, and restriction as well as grant.
- 673 tests overall; build clean with all eleven admin routes compiling.

**Not done:** no admin page has been rendered in a browser. They need an admin
session, and the remote database is still nine migrations behind, so most of the
tables do not exist there. This is the same gap `LAUNCH-CHECKLIST.md` records
for every signed-in page since Phase 07. Table overflow was handled by
construction — one shared `DataTable` with an `overflow-x-auto` container and a
`min-w` on the table itself, so a wide table scrolls inside its own box rather
than widening the document — but that is reasoning, not measurement.

## 12. The one operator step this phase adds

There is no UI to create the first admin, and there should not be: §13 says role
changes must never be client-controlled, and a bootstrap screen would be exactly
that. The first admin is a SQL statement, and `LAUNCH-CHECKLIST.md` §14 has it.
After that, admins can promote each other through `/admin/users/[id]` — with a
reason, an audit row, and a refusal if they target their own account.
