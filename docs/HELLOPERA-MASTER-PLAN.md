# HelloPera Master Project Plan

## 1. Project Overview

HelloPera is a mobile-first personal finance tracking and financial document intelligence Progressive Web App (PWA).

Its core purpose is to help users capture, understand, confirm, track, analyze, and forecast their financial activity.

Core flow:

```text
Capture
↓
Understand
↓
Confirm
↓
Track
↓
Analyze
↓
Forecast
```

HelloPera should help users answer:

- How much money do I currently have?
- Where is my money going?
- What bills are due soon?
- Who owes me money?
- What income is expected?
- What is my projected cash position?
- What supporting documents exist for each financial event?

---

## 2. Product Identity

### Product Name

```text
HelloPera
```

### Positioning

```text
A personal finance tracking and financial document intelligence PWA.
```

### Core Principles

- Mobile-first
- Fast transaction entry
- Financial data integrity
- User confirmation before OCR-derived records become official
- Privacy by default
- Clear separation of documents, obligations, and transactions
- Progressive enhancement
- Monetization without compromising usability
- Build by phase and validate before proceeding

---

## 3. Brand and Design System

### Theme

```text
HelloPera Jade
```

### Light Theme

```text
Primary Jade     #138A72
Deep Ink        #132238
Soft Jade       #45C2A5
Mist            #F4F8F7
Warm Sand       #F3E7D3
Gold Accent     #C9963E

Success         #2E9B62
Warning         #D58A34
Danger          #C94F5C
Muted Text      #6F7C87
```

### Dark Theme

```text
Background      #0B1420
Card            #142235
Primary Jade    #2CB89A
Soft Jade       #63D2B8
Gold Accent     #D8A857
Text            #F5F7F8
Muted           #98A5B3
```

### Accessible Text Variants

The brand colors above are chosen for fills, borders, chart marks and large
display figures. Measured against Mist `#F4F8F7`, none of them reaches the
4.5:1 WCAG AA threshold for body text:

```text
Deep Ink      #132238   14.93:1  pass
Danger        #C94F5C    4.12:1  fail
Primary Jade  #138A72    4.00:1  fail
Muted Text    #6F7C87    4.00:1  fail
Success       #2E9B62    3.28:1  fail
Warning       #D58A34    2.61:1  fail
Gold Accent   #C9963E    2.48:1  fail
```

Since income, expense and balance figures are text — and are the most
important text in the product — a parallel set of text tokens is required.
Use these wherever a semantic color carries a word or a number on a light
background, and for solid button fills that hold white labels:

```text
Primary text  #107A66    4.91:1
Success text  #217A4B    4.97:1
Warning text  #9A6216    4.75:1
Danger text   #BC4351    4.83:1
Gold text     #8A6413    5.01:1
Muted text    #647080    4.70:1
```

Note that white on Primary Jade `#138A72` is only 4.28:1, so primary buttons
use the `#107A66` fill (white on it is 5.25:1).

Gold and Warning fall below even the 3:1 bar for large text and UI
components, so on light backgrounds they are decorative only — never a
meaningful border or a focus ring.

The dark theme needs no such split — Primary Jade `#2CB89A` on `#0B1420` is
7.4:1 — but it was missing semantic colors entirely:

```text
Success dark  #4FC285    8.27:1
Warning dark  #E0A253    8.34:1
Danger dark   #E8697A    5.93:1
```

### Accessibility Target

```text
WCAG 2.2 Level AA
```

This applies to every surface: public site, application, and admin.

Status must never be conveyed by color alone — pair it with text or an icon.

### Design Rule

Use CSS variables and design tokens.

Use one set of semantic token names, redefined per theme.

Do not define theme-suffixed token names such as `--color-primary-dark`,
because that forces every component to know which theme is active.

Do not hardcode brand colors across components.

---

## 4. Platform and Technology Stack

### Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- PWA support

### Backend

- Next.js server-side application layer
- Server Actions and/or API routes where appropriate
- Modular service architecture

### Database and Backend Services

- Supabase PostgreSQL
- Supabase Auth
- Supabase Storage
- Supabase Row Level Security

### Image Processing

- Sharp
- WebP output
- Thumbnail generation
- OCR-friendly processing

### OCR

HelloPera will not build an OCR engine from scratch.

It will use an OCR provider abstraction so providers can be changed later.

Possible providers:

- Tesseract
- Google Vision
- AWS Textract
- Azure Vision
- Vision-capable AI providers

### Validation

- Zod

### Future Background Processing

- Redis
- BullMQ

---

## 5. Deployment Architecture

```text
Cloudflare
↓
HelloDeploy
↓
Next.js / Node.js
↓
Supabase + OCR/AI providers
```

### Responsibility Boundaries

```text
HelloDeploy
= application compute

Supabase
= persistent data

Cloudflare
= DNS, edge, security
```

HelloDeploy should remain largely stateless.

Permanent financial data and uploaded documents should not depend on the local HelloDeploy filesystem.

---

## 6. Supabase Strategy

Create a dedicated Supabase project for HelloPera.

Do not reuse unrelated project databases.

Use:

- PostgreSQL
- Supabase Auth
- Supabase Storage
- Row Level Security
- Database functions where appropriate
- Scheduled capabilities where appropriate

---

## 7. Authentication

Supported methods:

- Google OAuth
- Email and password

Required flows:

- Registration
- Login
- Continue with Google
- Email verification
- Password recovery
- Logout
- Session persistence
- Account deletion
- Disabled or suspended users
- OAuth error handling

New users always default to:

```text
role = user
```

OAuth metadata must never determine admin privileges.

---

## 8. RBAC

Initial roles:

```text
user
admin
```

Potential future role:

```text
super_admin
```

Authorization must exist at multiple layers:

```text
UI
↓
Route Protection
↓
Server-Side Authorization
↓
RLS / Database Security
```

Hiding UI controls is not authorization.

Admins should not automatically gain unrestricted access to private user financial data.

### Initial Admin Capabilities

- Manage users
- Suspend or reactivate users
- Manage plans
- Review subscriptions
- Monitor usage
- Manage content
- Manage feature flags
- Review failed OCR jobs
- View system health

### Planned Admin Routes

```text
/admin
/admin/users
/admin/subscriptions
/admin/usage
/admin/ocr-jobs
/admin/content
/admin/system
```

---

## 9. Core Financial Modeling Rule

HelloPera must keep these concepts separate:

```text
Document
Obligation
Transaction
```

Example:

```text
PLDT bill screenshot
↓
Bill
₱1,899 due September 22
↓
Payment Transaction
₱1,899 from GCash
```

This is a core architecture rule.

---

## 10. Accounts

Initial account types:

- Cash
- Bank
- GCash
- Maya
- PayPal
- Credit Card
- Loan
- Investment
- Other

Account fields should include:

- Name
- Type
- Currency
- Opening balance
- Current or cached balance
- Active status
- Optional provider or institution

Transactions remain the financial source of truth.

---

## 11. Currency and Monetary Accuracy

Default currency:

```text
PHP
```

All relevant accounts and transactions should still store an ISO currency code.

Use PostgreSQL `NUMERIC` or `DECIMAL` for monetary values.

Do not rely on JavaScript floating-point arithmetic for authoritative financial totals.

### Multi-Currency Decision

HelloPera supports multiple currencies for **recording and display only**.

```text
No exchange rates
No conversion
No combined cross-currency totals
```

Totals, analytics and forecasts are always computed per currency and shown
separately. A transaction may only settle an obligation of the same currency.

This is a settled product decision, not a deferral. Introducing conversion
would mean choosing a rate source, a rate date per transaction, and a
restatement policy for historical figures — none of which serve the product's
purpose. Revisit only with a concrete user need.

---

## 12. Transactions

Initial transaction types:

- income
- expense
- transfer
- refund
- adjustment

A transaction may include:

- Amount
- Currency
- Date and time
- Source account
- Destination account where applicable
- Category
- Merchant or provider
- Notes
- Tags
- Linked document
- Confirmation status

---

## 13. Transfers

Transfers must not count as income or expense.

Example:

```text
BPI → GCash
₱5,000
```

Account effect:

```text
BPI     -₱5,000
GCash   +₱5,000
```

Analytics effect:

```text
Income  ₱0
Expense ₱0
```

---

## 14. Manual Entry

Users must be able to create transactions without receipts.

Example:

```text
₱150
Lunch
Cash
Food
Today
```

The workflow should be optimized for mobile and require minimal interaction.

---

## 15. Bills

Bills represent obligations.

Possible fields:

- Provider
- Amount
- Due date
- Category
- Linked document
- Status
- Notes

Statuses:

- upcoming
- due soon
- due today
- overdue
- partially paid
- paid
- cancelled

A bill can have one or multiple payment transactions.

---

## 16. Receivables

Receivables represent money expected from another party.

Examples:

- Freelance client
- Reimbursement
- Personal lending
- Project payment

Statuses:

- pending
- partially paid
- paid
- overdue
- cancelled

Partial payments must be supported.

---

## 17. Expected Income

Expected income remains separate from actual income.

Expected income contributes to forecasting.

Only actual receipt creates an income transaction.

---

## 18. Recurring Financial Events

Support recurring:

- Salary
- Rent
- Loan payments
- Internet
- Subscriptions
- Insurance
- Utilities
- Other predictable cash flows

Recurring rules create expected financial events.

They must not automatically imply actual payment.

---

## 19. Categories and Tags

Default categories:

- Food
- Transportation
- Housing
- Utilities
- Loans
- Education
- Health
- Shopping
- Entertainment
- Subscriptions
- Fitness
- Car
- Business
- Technology
- Travel
- Other

Custom categories may be added later.

Tags provide flexible grouping such as:

- work
- capstone
- family
- travel
- server

---

## 20. Documents

Supported document sources:

- Receipt photos
- Screenshots
- Bills
- Payment confirmations
- Bank records
- E-wallet confirmations
- Invoices
- Statements
- Salary records
- PDFs

Documents should remain traceable to related financial records.

---

## 21. Image Processing

Image optimization is a core feature.

Pipeline:

```text
Upload
↓
Validate
↓
Correct Orientation
↓
Prepare OCR-Quality Version
↓
Generate Display WebP
↓
Generate Thumbnail WebP
↓
Run OCR
↓
Apply Original File Retention Policy
```

Use Sharp.

Possible generated versions:

```text
temporary OCR source
display.webp
thumb.webp
```

Initial configurable targets:

```text
Max dimension: approximately 1600–2000 px
WebP quality: approximately 80–90
```

---

## 22. Storage

Use a private Supabase Storage bucket:

```text
hello-pera-documents
```

Suggested object path:

```text
user-id/
  year/
    month/
      document-id/
        display.webp
        thumb.webp
```

Original uploads may exist temporarily during processing.

Access private files through signed URLs.

---

## 23. OCR Architecture

```text
Image
↓
Preprocessing
↓
OCR Provider
↓
Raw Text
↓
HelloPera Financial Parser
↓
Structured Data
↓
Validation
↓
User Review
```

OCR providers must be replaceable through a provider abstraction.

---

## 24. Financial Extraction

HelloPera should extract financial fields such as:

- Merchant or provider
- Amount
- Transaction date
- Due date
- Reference number
- Payment method
- Currency
- Document type
- Category
- Account information where appropriate

AI may assist with extraction.

All AI-derived structured output must pass schema validation before use.

---

## 25. User Confirmation

OCR results must not automatically become authoritative financial records.

Flow:

```text
Extract
↓
Display Fields
↓
Confirm / Edit / Discard
```

Only confirmed records affect official balances and analytics.

---

## 26. OCR Confidence

Store field-level confidence where possible.

Low-confidence fields should be visually highlighted for review.

---

## 27. Duplicate Detection

Potential matching signals:

- Amount
- Merchant
- Date and time
- Account
- Reference number
- Document source

User options:

- Merge
- Keep Both
- Review

Avoid automatic destructive merging in early versions.

---

## 28. Dashboard

Initial dashboard:

- Total available funds
- Account balances
- Monthly income
- Monthly expenses
- Upcoming bills
- Receivables
- Recent transactions
- Cash-flow summary

Later:

- Net worth
- Savings rate
- Debt position
- Cash runway
- Financial health indicators

---

## 29. Analytics

Initial analytics:

- Income vs expenses
- Spending by category
- Spending by account
- Monthly spending
- Merchant spending
- Largest expenses
- Recurring spending
- Bill history
- Receivable aging

Official analytics should use confirmed financial records only.

---

## 30. Forecasting

Start with deterministic forecasting.

```text
Projected Balance
=
Current Liquid Balance
+ Expected Income
+ Expected Receivables
- Upcoming Bills
- Recurring Expenses
```

AI may explain the forecast later.

AI must not be the authoritative calculation engine.

---

## 31. Notifications

Potential notification types:

- Bill due soon
- Bill overdue
- Receivable overdue
- Expected income upcoming
- Subscription renewal
- Low balance
- OCR requires review

Push notifications are a post-core feature.

---

## 32. AI Financial Assistant

Future example queries:

- How much did I spend on food this month?
- Which bills are due next week?
- Who still owes me money?
- How much should I reserve for bills?
- Can I afford a ₱20,000 purchase?

Architecture:

```text
User Question
↓
Structured Intent
↓
Approved Query Layer
↓
Financial Engine
↓
Database Result
↓
AI Explanation
```

AI must not receive unrestricted database access.

---

## 33. Security Requirements

Required early:

- Supabase Auth
- Google OAuth
- Row Level Security
- Private storage
- Signed URLs
- Server-side validation
- HTTPS
- Audit logging
- Rate limiting
- File validation

Every user-owned record must be scoped by `user_id`.

### Write-Path Rule

This is the single most important security decision in the plan, and every
phase depends on it.

```text
Client RLS grants SELECT on own rows only.
All INSERT / UPDATE / DELETE go through server actions.
```

Reasoning: with the Supabase anon key the browser reaches PostgREST directly.
RLS cannot distinguish a call made by the service layer from a `fetch` typed
into devtools. Any rule of the form "users may write through the trusted
flow" is therefore unenforceable — the database has no way to evaluate it.

Consequences that apply to every later phase:

- Server actions resolve the authenticated user server-side and check
  ownership before writing. Never accept `user_id` from the client.
- Write policies on user-owned tables exist for the service role, not the
  browser session.
- Balance-affecting writes, status transitions and job state are owned
  exclusively by services.
- Columns a user must never set — `role`, `status`, `processing_status`,
  `current_balance`, plan and subscription state — are unreachable from the
  client by construction, not by convention.

RLS remains enabled on every table regardless. It is the second layer, not
the only one.

### Write Policies in the Correct Form

Two rules that are easy to get wrong and expensive to fix later:

```sql
-- wrong: auth.uid() is re-evaluated for every row scanned
create policy transactions_select on transactions
  for select using (user_id = auth.uid());

-- right: evaluated once, then cached for the query
create policy transactions_select on transactions
  for select using (user_id = (select auth.uid()));
```

On a table with thousands of rows per user — which `transactions` will reach
for any real user — the unwrapped form calls the function once per row. The
wrapped form is documented by Supabase as 5–10x faster and is the same
security.

Second: **index every column a policy filters on.**

```sql
create index transactions_user_id_idx on transactions (user_id);
```

Without it, RLS turns every query into a sequential scan, and the cost grows
with total table size rather than with the user's own row count.

---

## 34. Audit History

Track important financial changes.

Prefer archival or soft deletion for significant financial records instead of casual permanent deletion.

---

## 35. Monetization

Initial plans:

```text
Free
Premium
```

Potential future plans:

```text
Family
Freelancer
Business
```

---

## 36. Free Plan

Possible free features:

- Manual transactions
- Basic accounts
- Bills
- Receivables
- Basic dashboard
- Limited OCR
- Basic analytics
- Limited AI
- Ads

Exact limits remain configurable.

---

## 37. Premium Plan

Potential premium features:

- No ads
- Higher OCR limits
- Higher AI usage
- Advanced analytics
- Forecasting
- Exports
- Longer document retention
- More automation
- Advanced reports

---

## 38. Entitlements

Do not scatter checks like:

```text
if user.plan === "premium"
```

Use entitlements such as:

```text
monthlyOCRUploads
aiQueriesPerMonth
advancedAnalytics
forecastEnabled
exportEnabled
adsEnabled
documentRetentionDays
```

---

## 39. Subscription Architecture

Future tables:

- plans
- subscriptions
- subscription_events
- usage_records

Subscription lifecycle:

- start
- renew
- cancel
- expire
- failed payment
- plan change

---

## 40. Billing Provider Abstraction

Use a replaceable billing provider abstraction.

This keeps HelloPera open to Philippine and international payment providers.

---

## 41. Usage Tracking

Track costly resources:

- OCR requests
- AI queries
- Storage
- Document uploads
- Exports where relevant

---

## 42. AdSense Strategy

HelloPera should contain:

```text
Public Content Website
+
Authenticated Finance Application
```

Public pages:

- Home
- Features
- About
- Help
- FAQ
- Guides
- Blog
- Privacy
- Terms
- Contact

Potential content topics:

- Budgeting
- Saving
- Debt
- Digital wallets
- Bills
- Freelancer finance
- Financial planning
- Personal finance education

Ads should not interfere with transaction or payment actions.

Premium users should have:

```text
adsEnabled = false
```

---

## 43. SEO

Public pages should support:

- Metadata
- Canonical URLs
- Open Graph
- Sitemap
- robots.txt
- Structured data
- Semantic HTML
- Strong mobile performance
- Core Web Vitals

---

## 44. Admin System

Initial admin capabilities:

- User management
- User status
- Plans
- Subscriptions
- Usage
- Failed OCR processing
- Content
- Feature flags
- System health

Admins should not automatically gain unrestricted access to private receipts and financial transactions.

---

## 45. Background Jobs

MVP may process tasks directly when practical.

Future:

```text
Upload
↓
Queue
↓
Worker
├── Image Processing
├── OCR
├── Extraction
├── Duplicate Detection
├── Notifications
└── Analytics Refresh
```

Potential stack:

- Redis
- BullMQ

---

## 46. PWA Features

Initial:

- Installable
- Responsive
- Camera support
- File uploads
- App-shell caching

Do not initially support full offline financial writes.

---

## 47. Data Portability

Users should eventually be able to:

- Export transactions
- Export CSV
- Export reports
- Download documents
- Delete their account
- Request data deletion

---

## 48. Reliability

Architecture should include:

- Structured error handling
- Idempotent processing
- Migration strategy
- Logging
- Health checks
- Failed OCR recovery
- Webhook verification
- Backup strategy
- Disaster recovery planning

---

## 49. Environments

Plan for:

```text
development
staging
production
```

At minimum:

```text
.env.local
HelloDeploy production secrets
```

Never commit secrets to Git.

---

## 50. Core Database Planning Set

Tables may include:

```text
profiles
accounts
categories
transactions
transaction_tags
tags

documents
ocr_results

bills
bill_payments

receivables
receivable_payments

recurring_rules
expected_income

audit_logs
notifications

plans
subscriptions
subscription_events
usage_records
```

Do not create every table on day one.

Create tables as their implementation phase begins.

Full column-level definitions, relations, and the phase that creates or
extends each table live in:

```text
DATA-MODEL.md
```

Keep that file current as phases land. A schema spread across ten phase
documents drifts; a consolidated one does not.

### Visual design

The source of truth for visual design is:

```text
docs/HelloPera Finance UI Showcase.png
```

It defines the palette in use, Plus Jakarta Sans as the typeface, the dark
navigation rail, the hero banner, the stat cards with sparklines and deltas,
the two dashboard charts, the badge and button sets, and the mobile quick
actions. Read it before building any screen.

Brand identity is separate, and lives in:

```text
image/Icon-only-master.png
image/Primary-horizontal-logo-with-tagline.png
```

Every favicon, PWA icon and social image is generated from those two files by
`npm run icons` and committed. Never hand-edit an output.

`image/` holds several other cuts — stacked, monochrome, pre-rendered tiles —
which are reference rather than build inputs. `docs/DESIGN-SYSTEM.md` §2 lists
each and says which the build uses, and why the pre-rendered app and maskable
tiles are deliberately not among them.

```text
docs/DESIGN-SYSTEM.md
```

records how the showcase is implemented and the places the build departs
from it — each with the measured contrast ratio behind the decision. The
largest: the showcase paints small delta and hint text in the raw brand hexes,
which fail WCAG 2.2 AA as text (Success 3.51:1, Gold 2.65:1 on white), so
those hues have darker `-text` variants. Fills, chart marks, chips and
illustrations keep the brand hexes exactly as drawn.

Phase-specific implementation notes live beside the phase they belong to, as
`docs/PHASE-NN-NOTES.md`. They record what a reader of the phase document would
otherwise have to reverse-engineer: `PHASE-06` the PostgREST row cap and why the
net-position sparkline was removed; `PHASE-07` the back-dated-bill bug found by
running the generator; `PHASE-08` the escalation-step rule; `PHASE-09` the
opposite failure directions of the usage meters; `PHASE-11` why webhook
idempotency belongs to the database rather than the application; `PHASE-12` why
a Zod union, and not prompt wording, is what resists prompt injection; `PHASE-13`
why admin privacy is asserted by a test rather than promised in a comment; and
`PHASE-14` why a checker that repairs as it reads cannot report, and why
maintenance mode is the one switch that is not a feature flag.

---

## 51. Application Navigation

### User

```text
Dashboard
Transactions
Capture
Accounts
Bills
Receivables
Analytics
Documents
Settings
```

### Mobile Priority Navigation

```text
Home
Transactions
Capture
Analytics
More
```

### Admin

```text
Dashboard
Users
Subscriptions
Usage
OCR Jobs
Content
System
```

---

# 52. Phase-Based Implementation

Each phase receives its own Markdown implementation specification.

## Phase 0 — Project Foundation

Focus:

- Next.js
- TypeScript
- Tailwind
- HelloPera Jade
- PWA shell
- Repository
- Directory structure
- Environment configuration
- Supabase connection
- HelloDeploy compatibility

File:

```text
PHASE-00-PROJECT-FOUNDATION.md
```

---

## Phase 1 — Authentication, Google OAuth, RBAC and Security

Focus:

- Supabase Auth
- Email and password
- Google OAuth
- Profiles
- User and admin roles
- Protected routes
- RLS
- Basic admin shell
- Account status
- Password recovery
- Email verification
- Session handling

File:

```text
PHASE-01-AUTH-RBAC.md
```

---

## Phase 2 — Financial Core

Focus:

- Accounts
- Categories
- Manual transactions
- Income
- Expense
- Transfer
- Refund
- Adjustment
- Balance engine
- Currency handling
- Safe monetary arithmetic
- Audit logging

File:

```text
PHASE-02-FINANCIAL-CORE.md
```

---

## Phase 3 — Bills, Receivables and Expected Income

Focus:

- Bills
- Due dates
- Bill payments
- Receivables
- Partial payments
- Expected income
- Status handling

File:

```text
PHASE-03-BILLS-RECEIVABLES.md
```

---

## Phase 4 — Documents and Image Processing

Focus:

- Camera upload
- File upload
- PDF handling
- Supabase Storage
- Private files
- Sharp
- WebP conversion
- Thumbnails
- Metadata
- Signed URLs
- Document library

File:

```text
PHASE-04-DOCUMENTS-IMAGES.md
```

---

## Phase 5 — OCR and Financial Extraction

Focus:

- OCR abstraction
- OCR provider
- Raw OCR storage
- Financial parser
- AI extraction if needed
- Confidence
- Validation
- Review screen
- Confirm, edit, discard
- Duplicate-detection foundation

File:

```text
PHASE-05-OCR-EXTRACTION.md
```

---

## Phase 6 — Dashboard and Analytics

Focus:

- Financial dashboard
- Monthly summaries
- Income vs expense
- Category spending
- Account balances
- Bills
- Receivables
- Recent transactions
- Charts
- Filters

File:

```text
PHASE-06-DASHBOARD-ANALYTICS.md
```

At the end of Phase 6, HelloPera reaches its initial MVP.

---

## Phase 7 — Recurring Transactions and Forecasting

Focus:

- Recurring rules
- Expected cash flow
- Future bills
- Future income
- Projected balance
- Forecast engine

File:

```text
PHASE-07-RECURRING-FORECASTING.md
```

---

## Phase 8 — Notifications and Automation

Focus:

- Due reminders
- Overdue reminders
- Receivable reminders
- Push notifications
- Scheduled processing
- Background workers if needed

File:

```text
PHASE-08-NOTIFICATIONS-AUTOMATION.md
```

---

## Phase 9 — Monetization Foundation

Focus:

- Plans
- Subscriptions
- Entitlements
- Usage quotas
- adsEnabled
- Billing abstraction
- Free and Premium feature gating

File:

```text
PHASE-09-MONETIZATION-FOUNDATION.md
```

---

## Phase 10 — Public Website, Content, SEO and AdSense

Focus:

- Landing pages
- Blog
- Guides
- FAQ
- Help
- Privacy
- Terms
- Contact
- SEO
- AdSense-ready placements

File:

```text
PHASE-10-PUBLIC-WEBSITE-SEO-ADSENSE.md
```

---

## Phase 11 — Premium Billing

Focus:

- Checkout
- Webhooks
- Renewals
- Cancellations
- Failed payments
- Plan changes
- Premium activation
- Billing history

File:

```text
PHASE-11-PREMIUM-BILLING.md
```

---

## Phase 12 — AI Financial Assistant

Focus:

- Natural-language questions
- Intent parsing
- Safe financial queries
- Financial context
- AI explanations
- Usage quotas

File:

```text
PHASE-12-AI-FINANCIAL-ASSISTANT.md
```

---

## Phase 13 — Admin and Operations

Focus:

- Advanced user administration
- Subscription operations
- OCR failure management
- System monitoring
- Content tools
- Feature flags
- Usage monitoring

File:

```text
PHASE-13-ADMIN-OPERATIONS.md
```

---

## Phase 14 — Production Hardening

Focus:

- Performance
- Rate limiting
- Queue workers
- Load testing
- Database optimization
- Backup and recovery
- Accessibility
- Observability
- Security review
- PWA polish

File:

```text
PHASE-14-PRODUCTION-HARDENING.md
```

---

# 53. Phase Document Standard

Every phase implementation Markdown must open and close with the same four
sections, in this order:

1. Objective
2. Dependencies
3. Scope / Out of Scope

...then whatever design detail the phase actually needs, then:

4. Testing Checklist
5. Deployment Checks
6. Acceptance Criteria
7. Definition of Done

Between the scope and the checklists, cover whichever of these the phase
touches — database changes, routes, services, security requirements, UI/UX,
validation, error handling — under whatever headings read most naturally.

This is deliberately looser than a fixed section list. An earlier draft of
this plan mandated eighteen numbered sections and no phase document followed
it, because phases differ: Phase 00 has no database changes and Phase 14 has
no new routes. A standard that is not followed is not a standard.

What is mandatory is the frame: a phase must state what it is for, what it
needs first, what it will and will not build, how it is tested, and how you
know it is done.

Rule:

```text
Do not proceed to the next phase until the current phase passes its acceptance criteria.
```

---

# 54. MVP Boundary

There are two gates, not one.

## Gate 1 — Manual Tracker

```text
Phase 0
Phase 1
Phase 2
Phase 3
Phase 6
```

At this point a user can:

- Register using Google or email
- Manage accounts
- Manually record income, expenses, transfers, refunds and adjustments
- Track bills and record full or partial payments
- Track receivables and record collections
- Record expected income
- View dashboard analytics, spending breakdowns and cash flow

This is a complete, useful personal finance application. It is worth
shipping on its own, to real users, before building the most expensive and
technically riskiest part of the product.

Phase 6 does not depend on Phases 4 and 5. Its analytics read confirmed
transactions, bills, receivables and expected income — all of which exist at
the end of Phase 3.

## Gate 2 — Document Intelligence

```text
Phase 4
Phase 5
```

Adds:

- Upload financial documents and PDFs
- Optimize images to WebP with thumbnails
- OCR receipts and screenshots
- Review extracted information
- Create financial records from confirmed extractions

This is what distinguishes HelloPera from a spreadsheet, and it is worth
building — but building it against real usage from Gate 1 will produce a
better result than building it against assumptions.

Phase 6 may be revisited briefly after Phase 5 to surface document links in
the dashboard.

---

# 54a. Pre-Public-Launch Gate

Phase 10 publishes a public website. Phase 11 charges real money. Both
happen well before Phase 14, where recovery and privacy work currently sits.

The following must pass **before Phase 10 publishes anything**, regardless of
which phase the work is drawn from:

```text
Database backup confirmed to exist
Restore actually tested into a non-production environment
Account deletion implemented and working
Data export implemented and working
Rate limiting active on authentication endpoints
No secret reachable from the client bundle
Cross-user access tests passing
```

Reasoning: taking payment and holding financial documents while unable to
demonstrate a restore is not an acceptable position, and the privacy policy
that Phase 10 publishes must describe deletion that genuinely exists.

A backup that has never been restored is not a backup.

---

# 55. Build Governance

- Build one phase at a time.
- Commit and test each phase independently.
- Avoid introducing future-phase features prematurely.
- Database changes must be migration-driven.
- Security requirements begin in Phase 1 and apply to every later phase.
- All mutations go through server actions; client RLS is read-only (see §33).
- UI should follow HelloPera Jade design tokens and meet WCAG 2.2 AA.
- HelloDeploy capabilities are verified in Phase 0 against
  `PLATFORM-HELLODEPLOY.md`, not discovered phase by phase.
- `DATA-MODEL.md` is updated in the same commit as any schema migration.
- Supabase remains the system of record for persistent user data.
- The pre-public-launch gate (§54a) is checked before Phase 10 publishes.
