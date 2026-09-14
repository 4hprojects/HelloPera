# Phase 08 — implementation notes

Decisions taken while building notifications and automation that a reader of
`PHASE-08-NOTIFICATIONS-AUTOMATION.md` would otherwise have to
reverse-engineer.

---

## 1. The dedupe key is the whole design

Everything else in this phase is ordinary CRUD. The one genuinely subtle part
is §17, and getting it wrong produces a system that looks correct in testing
and is unusable in production.

The scheduler runs hourly. A date-anchored reminder — due soon, due today,
upcoming — is safe with a key like `bill:<id>:due_soon:<due_date>`, because the
condition is true on exactly one day.

Overdue has no such anchor. `due_date < today` stays true indefinitely:

| Key shape | Result |
|---|---|
| `bill:<id>:overdue` | fires once, ever — never escalates |
| `bill:<id>:overdue:<today>` | fires every single day, forever |
| `bill:<id>:overdue:<step>` | three reminders, each sent once |

`escalationStepFor()` returns the **highest step passed**, not the nearest. At
day 10 the answer is step 7, and step 7's key was already used on day 7, so
nothing fires until day 30. That single choice is what converts a true-forever
condition into a finite ladder.

Verified rather than reasoned about: simulating 45 consecutive daily scheduler
runs against one overdue bill produced exactly three notifications, on days 1,
7 and 30.

## 2. Quiet hours are a wrapping window, and the naive check silently disables them

The default is 22:00–07:00. A reader reaching for `start <= t && t < end` gets
a function that returns `false` for **every** hour of that window — quiet hours
would appear implemented, pass a casual test at 03:00 with a 01:00–06:00
window, and do nothing for every real user.

`isWithinQuietHours` handles both orientations, and treats `start === end` as
an *empty* window rather than an all-day one: two matching values in a settings
form must not mute every notification a user ever receives.

Quiet hours **defer**, never drop (§32). A reminder suppressed at 23:00 and
discarded means the user is simply never told, which is worse than telling them
late. `scheduled_for` moves to the end of the window and the row stays
`pending`.

## 3. Preferences are checked during generation, not at display

§42 could be read as "filter what you show". That is wrong here: push delivery
reads the notification row, not the in-app view. Filtering at render time would
still have sent the push for a category the user switched off — the single
complaint most likely to lose their trust in the feature.

So every insert joins `notification_preferences` and the preference is part of
the `where` clause. Verified by switching `bill_overdue` off and confirming the
row is never created.

## 4. Copy is rendered, not stored — except when it is

In-app notifications render from `metadata` at read time through
`lib/notifications/copy.ts`. Two reasons: a wording fix then reaches reminders
already queued, and the SQL generator never has to build prose, which would put
the wording beyond the reach of a test.

`title`/`message` on the row are populated only by push delivery, and they mean
something different: *what was actually sent to this person's phone*. That is
worth recording, and it is not the same as what the row would say if rendered
now.

## 5. Push copy is deliberately less useful

§14 and §30 both say to keep sensitive detail out of push. The concrete rule
adopted here: **no amounts**. A push renders on a lock screen, in front of
whoever happens to be holding the phone, and "Your Converge bill is due in 3
days" is a reminder while "…is due in 3 days (₱1,799.00)" is a disclosure.

`renderPushNotification` strips the amount and reuses the same copy otherwise,
and a test asserts that no push message for any type can contain a currency
figure.

## 6. Push is enabled by subscribing, not by a checkbox

The settings toggle can only ever turn push *off*. Turning it on requires a
browser permission grant plus a stored subscription, which is what the
subscribe action does — so the preference can never claim push is on when no
device could receive it (§13).

`denied` is a terminal state in the UI, explained rather than retried. A denied
web-push permission cannot be re-requested by the site; only the user can undo
it. That also drives the §26 decision not to prompt on load: the cost of asking
too early is losing the channel permanently.

## 7. The service worker caches nothing

§46 permits extending a service worker for push and warns against caching
sensitive API data broadly. Given this app's responses are a person's financial
records, the worker handles `push` and `notificationclick` and nothing else.

An offline shell is worth having later, with an explicit allowlist of static
assets. Caching by default would put balances in a store that outlives the
session, and a service worker is an awkward place to discover that.

## 8. Why there is an HTTP scheduler endpoint at all

Generation lives in Postgres, like Phase 07's, because it is set-shaped work
over rows the database already holds.

Delivery cannot. It needs the VAPID private key and an outbound HTTPS request
per subscription, neither of which belongs in a database function. So
`POST /api/scheduler` exists, and §58's requirements are met concretely:

- **POST only** — a GET would be run by link previewers, prefetchers and
  crawlers, any of which would then be operating the scheduler.
- **Constant-time secret comparison** — a plain `===` leaks length, and across
  enough requests, content. It costs nothing to avoid and is awkward to
  retrofit once something depends on the endpoint.
- **Fails closed** — an unset `SCHEDULER_SECRET` returns 503 rather than
  running unauthenticated, so a misconfigured deployment is visibly broken
  rather than silently public.

## 9. What the shortfall projection does and does not include

It mirrors `projectBalance()` in `lib/forecast/project.ts`: opening liquid
cash, dated inflows, dated outflows, walked day by day, reporting the first day
the running balance goes below zero.

It is written in SQL rather than calling the TypeScript engine because §19 says
generation must not depend on the user opening a page — and a shortfall warning
you only receive by visiting the forecast is precisely the warning you did not
get.

**Receivables are excluded**, matching Phase 07 §31. A reminder must not rest
on money less certain than the forecast page itself assumes.

**Investment accounts are excluded**, matching Phase 07 §32/§33. Verified with
a seeded ₱500,000 investment account that correctly did not prevent a ₱1,000
shortfall being reported.

§64's "do not notify on every recalculation" needs no extra state: the dedupe
key carries the shortfall date, so an unchanged projection reuses the key and
stays quiet while one that moves earlier is a new key and notifies again. Both
directions verified.

## 10. The bell used to count something that could not be cleared

The top bar's badge previously counted bills due or overdue. That number stayed
lit until the user paid something, so it never meant "there is something new
here" — it was permanent furniture, and a badge that is always on is a badge
nobody reads.

It now counts unread notifications, which are dismissible. That is what §20
describes, and it is the difference between a signal and decoration.

## 11. Verified against a real database

The generator was exercised against a real Postgres with a seeded scenario
covering all ten reminder types:

- All ten generate; a `paid` bill and a `skipped` occurrence are correctly
  passed over.
- Repeat runs create zero (§18).
- A 9-days-overdue bill lands on escalation step 7, matching
  `escalationStepFor(9)`.
- A suspended profile receives nothing (§43).
- The shortfall projection matched hand-computed values exactly.

## 12. Still unverified

- **Push has never actually been sent.** There are no VAPID keys in this
  environment and no browser to subscribe from, so `deliverPendingPushes` is
  verified by type and review only. Criteria 12 and 14 need a real device.
- **Nothing has been applied to the remote project**, and `pg_cron` availability
  on that plan remains unconfirmed — the open question carried over from
  Phase 07.
- **The UI has not been rendered.** `/notifications` and
  `/settings/notifications` compile and build, but no page in Phases 07–08 has
  been loaded in a browser, because the Phase 07 and 08 tables do not exist in
  the remote database yet.
