# HelloPera — Phase 00: Project Foundation

## 1. Objective

Create the technical foundation for HelloPera.

At the end of this phase, HelloPera should:

- Run locally
- Build successfully in production mode
- Be deployable through HelloDeploy
- Connect successfully to the dedicated Supabase project
- Use TypeScript
- Use Tailwind CSS
- Apply the HelloPera Jade design system
- Have a basic responsive PWA shell
- Have a clean modular directory structure
- Use environment variables correctly
- Contain no financial business logic yet

This phase exists to stabilize the project foundation before authentication or finance functionality is added.

---

## 2. Dependencies

Before starting:

- Dedicated HelloPera Supabase project created
- Supabase project URL available
- Supabase public/anon key available
- HelloDeploy deployment capability available
- Git repository available
- Node.js version supported by the selected Next.js version

---

## 3. Scope

### Included

- Project initialization
- Next.js
- React
- TypeScript
- Tailwind CSS
- ESLint
- Basic formatting convention
- Environment configuration
- Supabase client initialization
- HelloPera Jade design tokens
- Light mode
- Dark mode foundations
- Responsive application shell
- Public landing shell
- Placeholder authenticated app shell
- Placeholder admin shell
- PWA metadata foundation
- App icons and manifest placeholders
- HelloDeploy production build verification
- Base logging/error boundary strategy
- Directory architecture
- README project setup instructions

### Out of Scope

Do not implement yet:

- User registration
- Login
- Google OAuth
- RBAC behavior
- Financial accounts
- Transactions
- Bills
- Receivables
- OCR
- Image uploads
- Supabase Storage
- Analytics
- Subscription billing
- AdSense
- AI assistant

Placeholder routes may exist, but they should not contain business logic.

---

## 4. Technology Stack

Use:

```text
Framework: Next.js
UI: React
Language: TypeScript
Styling: Tailwind CSS
Database platform: Supabase
Deployment: HelloDeploy
Edge/DNS: Cloudflare
PWA: Web App Manifest + service-worker strategy
```

---

## 5. Project Naming

### Display Name

```text
HelloPera
```

### Suggested Repository Name

```text
hello-pera
```

### Suggested Application Identifier

```text
hello-pera
```

Avoid inconsistent naming such as:

```text
hellopera-app
hello-finance
pera-tracker
```

unless required by deployment infrastructure.

---

## 6. Suggested Directory Structure

```text
hello-pera/
│
├── app/
│   ├── (public)/
│   │   └── page.tsx
│   │
│   ├── (app)/
│   │   └── dashboard/
│   │       └── page.tsx
│   │
│   ├── admin/
│   │   └── page.tsx
│   │
│   ├── layout.tsx
│   ├── globals.css
│   └── not-found.tsx
│
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── ui/
│   └── brand/
│
├── lib/
│   ├── supabase/
│   ├── env/
│   ├── utils/
│   └── constants/
│
├── services/
│
├── schemas/
│
├── types/
│
├── hooks/
│
├── public/
│   ├── icons/
│   └── images/
│
├── styles/
│
├── docs/
│
├── .env.example
├── README.md
├── package.json
├── tsconfig.json
└── next.config.*
```

Notes:

- `services/` remains mostly empty in Phase 00.
- Do not invent business abstractions before Phase 2.
- There is no `repositories/` layer. Services own their own queries — see
  `PHASE-02` §39.
- Keep reusable UI components separate from route-specific components.

---

## 7. Design Tokens

Create centralized tokens for HelloPera Jade.

Use **one set of semantic token names**, redefined per theme. Do not create
theme-suffixed names such as `--color-primary-dark`, because that forces
every component to know which theme is active — which contradicts the rules
below and §11.

### Token Definitions

```css
:root {
  /* surfaces */
  --color-background: #F4F8F7;
  --color-surface:    #FFFFFF;
  --color-sand:       #F3E7D3;

  /* brand — fills, borders, chart marks, large display figures */
  --color-primary:      #138A72;
  --color-primary-soft: #45C2A5;
  --color-gold:         #C9963E;
  --color-success:      #2E9B62;
  --color-warning:      #D58A34;
  --color-danger:       #C94F5C;

  /* text — WCAG AA verified against --color-background */
  --color-text:         #132238;  /* 14.93:1 */
  --color-text-muted:   #647080;  /*  4.70:1 */
  --color-primary-text: #107A66;  /*  4.91:1 */
  --color-success-text: #217A4B;  /*  4.97:1 */
  --color-warning-text: #9A6216;  /*  4.75:1 */
  --color-danger-text:  #BC4351;  /*  4.83:1 */
  --color-gold-text:    #8A6413;  /*  5.01:1 */

  /* solid fills carrying white labels */
  --color-primary-fill: #107A66;  /* white on it: 5.25:1 */
}

:root[data-theme="dark"] {
  --color-background: #0B1420;
  --color-surface:    #142235;
  --color-sand:       #2A2418;

  --color-primary:      #2CB89A;
  --color-primary-soft: #63D2B8;
  --color-gold:         #D8A857;
  --color-success:      #4FC285;
  --color-warning:      #E0A253;
  --color-danger:       #E8697A;

  --color-text:         #F5F7F8;
  --color-text-muted:   #98A5B3;
  --color-primary-text: #2CB89A;  /* 7.43:1 */
  --color-success-text: #4FC285;  /* 8.27:1 */
  --color-warning-text: #E0A253;  /* 8.34:1 */
  --color-danger-text:  #E8697A;  /* 5.93:1 */
  --color-gold-text:    #D8A857;  /* 8.51:1 */

  --color-primary-fill: #2CB89A;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    /* repeat the dark block so system preference works
       without an explicit choice */
  }
}
```

### Why Two Sets of Semantic Colors

The brand hexes fail WCAG AA as body text on the light background:

```text
Danger        #C94F5C   4.12:1   fail
Primary Jade  #138A72   4.00:1   fail
Muted         #6F7C87   4.00:1   fail
Success       #2E9B62   3.28:1   fail
Warning       #D58A34   2.61:1   fail
Gold          #C9963E   2.48:1   fail
```

Income and expense amounts are text, and they are the most important text in
the product — so `--color-*-text` carries words and numbers, while
`--color-*` carries fills, borders and chart marks. White on Primary Jade is
only 4.28:1, which is why buttons use `--color-primary-fill`.

Gold `#C9963E` (2.48:1) and Warning `#D58A34` (2.61:1) fall below even the
3:1 bar for large text and UI components, so on the light theme they are
limited to decorative fills and chart marks — never a border that carries
meaning, and never a focus ring.

The dark theme needs no split; its brand colors already clear AA.

### Rules

- Do not scatter raw brand hex values throughout JSX.
- Components should use semantic tokens and must not reference a theme.
- Income, expense, warning, overdue, and neutral states must use semantic colors.
- Use `--color-*-text` for any semantic color applied to text.
- Target WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and UI components.
- Never convey status by color alone — pair it with text or an icon.
- Re-measure contrast whenever a token value changes.

---

## 8. Typography

Use a readable modern sans-serif stack.

Primary goals:

- High readability on small mobile screens
- Good numeric readability
- Clear hierarchy for financial figures
- Good Philippine peso symbol rendering

Typography should define:

- Display
- H1
- H2
- H3
- Body
- Small
- Label
- Financial amount

Do not depend on decorative fonts for core financial UI.

---

## 9. Base Layout

### Public Shell

Should support future routes such as:

```text
/
features
about
help
guides
blog
privacy
terms
contact
```

Only the base shell needs to exist in Phase 00.

### App Shell

Placeholder layout should support future navigation:

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

### Mobile Navigation

Prepare visual space for:

```text
Home
Transactions
Capture
Analytics
More
```

### Admin Shell

Placeholder route:

```text
/admin
```

No actual admin authorization yet.

Display a clear development-only placeholder.

RBAC is implemented in Phase 01.

---

## 10. Responsive Requirements

Minimum target classes:

```text
Mobile
Tablet
Desktop
```

The application should be usable from approximately:

```text
320px width and above
```

Primary mobile requirements:

- No horizontal overflow
- Tap targets should be comfortable
- Navigation should collapse appropriately
- Financial summary cards should reflow vertically
- Desktop sidebar should not be forced onto mobile

---

## 11. Dark Mode Foundation

Implement a clean theme architecture that can support:

```text
light
dark
system
```

Do not deeply couple components to one theme.

Theme selection persistence can be simple in Phase 00.

---

## 12. Supabase Connection

Create separate client utilities for browser and server usage where appropriate.

Suggested location:

```text
lib/supabase/
```

Do not expose server-only credentials to the browser.

Phase 00 only needs to verify that the application can connect to Supabase.

### Also Confirm `pg_cron`

Phase 07 schedules its work with `pg_cron` (`PHASE-07` §2), and Phases 08 and
11 inherit that choice. Confirm the extension is available on the chosen plan
now:

```sql
select * from pg_available_extensions where name = 'pg_cron';
```

It costs a minute here. Discovering it in Phase 07 means redesigning three
phases' scheduling after they are specified.

No application tables need to be created yet except any minimal infrastructure required by the chosen Supabase initialization flow.

---

## 13. Environment Variables

Create:

```text
.env.local
.env.example
```

Example public variables:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_NAME=HelloPera
NEXT_PUBLIC_APP_URL=
```

Server-only secrets must not use the `NEXT_PUBLIC_` prefix.

The `.env.example` file must contain names only, not real credentials.

### Two Mistakes That Actually Happened Here

**1. The API URL is not the database host.** Both appear on the Supabase
dashboard and they differ by three characters:

```text
correct   https://<ref>.supabase.co
wrong     https://db.<ref>.supabase.co
```

The `db.` host speaks the Postgres wire protocol on 5432 and serves no HTTP
API at all — it is also IPv6-only, so on an IPv4-only network it fails to
connect rather than returning an error. Every `supabase-js` call fails with a
network error that says nothing about the cause.

Verify after configuring:

```bash
curl -s -H "apikey: $ANON_KEY" https://<ref>.supabase.co/auth/v1/health
# expect HTTP 200 and a GoTrue version
```

`/rest/v1/` returning 401 is normal — that endpoint requires `service_role`.

**2. Ignore `.env*`, not a fixed list.** A list like `.env`, `.env.local`,
`.env.production.local` misses `.env.backup-20260913`, `.env.save`, and
anything an editor or a careful engineer leaves behind:

```gitignore
.env*
!.env.example
```

The catch-all plus one negation is both shorter and safe by default.

### Verify the Key Is Actually the Anon Key

Supabase keys are JWTs; the payload is base64, not encrypted. Decode it and
check the `role` claim reads `anon`. A `service_role` key behind a
`NEXT_PUBLIC_` prefix is shipped to every browser and grants full database
access bypassing RLS — the single worst configuration mistake available in
this stack, and it looks identical to the correct one in the dashboard.

Worth doing as an automated check in the environment validation (§14) rather
than by eye.

---

## 14. Environment Validation

Create an environment validation strategy.

The app should fail clearly during startup if required environment variables
are missing.

Avoid silent undefined environment configuration.

### Validate Shape, Not Just Presence

A present-but-wrong value is harder to diagnose than a missing one, because
the failure surfaces far from the cause. Validate with Zod at startup:

```text
NEXT_PUBLIC_SUPABASE_URL
  - parses as a URL
  - host matches <ref>.supabase.co
  - REJECT a "db." prefix with a message naming the fix

NEXT_PUBLIC_SUPABASE_ANON_KEY
  - decodes as a JWT
  - payload "role" claim === "anon"
  - REJECT "service_role" loudly — see §13

NEXT_PUBLIC_APP_URL
  - parses as a URL
```

The `db.` check and the role check are each one line and each prevents a
failure that otherwise costs an afternoon — the first because it presents as
an unexplained network timeout, the second because it presents as nothing at
all until someone reads your client bundle.

Fail the build, not the first request.

---

## 15. PWA Foundation

Phase 00 should establish:

- Web App Manifest
- App name
- Short name
- Theme color
- Background color
- Display mode
- Icon placeholders
- Installability-ready structure

Suggested values:

```text
name: HelloPera
short_name: HelloPera
display: standalone
theme_color: #138A72
background_color: #F4F8F7
```

Offline financial writes are explicitly out of scope.

Do not cache authenticated financial API responses in this phase.

---

## 16. Metadata

Create base metadata for:

```text
Title
Description
Theme color
Open Graph defaults
Application name
Viewport
```

Suggested working description:

```text
HelloPera helps you track your money, bills, receivables, financial documents, and cash flow in one place.
```

Final marketing copy may be revised later.

---

## 17. Base Components

Create only foundational reusable components.

Suggested starting components:

```text
Button
Card
Input
Label
Badge
PageHeader
AppLogo
Sidebar
MobileNav
ThemeToggle
EmptyState
LoadingState
ErrorState
```

Avoid creating complex financial widgets in Phase 00.

---

## 18. Logo and Brand Assets

Use the approved HelloPera Jade direction.

Required placeholders or assets:

- Main logo
- Icon-only mark
- Favicon
- PWA icons
- Dark mode logo variant if needed

Do not embed temporary unrelated branding that may survive into production.

---

## 19. Application Routes

Minimum Phase 00 routes:

```text
/
 /dashboard
 /admin
```

Optional placeholders:

```text
/features
/privacy
/terms
```

These routes should demonstrate shell/layout behavior only.

---

## 20. HelloDeploy Compatibility

The project must support a standard production flow such as:

```bash
npm ci
npm run build
npm start
```

or the equivalent required by HelloDeploy.

Basic validation:

- Correct Node.js runtime
- Build succeeds
- Next.js production server starts
- Environment variables are available
- Static assets load
- Route refreshes work
- Cloudflare proxying does not break assets
- No local filesystem dependency for permanent application state

### Capability Matrix — Required

Building and starting is not enough. Later phases depend on platform
capabilities that would otherwise be discovered one at a time, each at the
phase that needs it — native Sharp binaries in Phase 04, a long-running
request in Phase 05, **scheduled execution in Phase 07**, an inbound webhook
in Phase 11.

By Phase 07 six phases would already sit on the platform. If it cannot run
scheduled work, Phases 07, 08, 11 and 14 all need redesign.

Phase 00 therefore verifies the whole matrix up front:

```text
PLATFORM-HELLODEPLOY.md
```

Work down it, record each result, and adopt the stated fallback for anything
unavailable.

Rows S1 (scheduling) and I3 (PDF rendering) are already resolved by reading
HelloDeploy's source — both unavailable, both with fallbacks chosen. Row I1
(Sharp) is partly proven by a local spike.

### The One Deployment That Must Happen Early

```text
Deploy a route that calls Sharp to HelloDeploy, and hit it.
```

Sharp runs correctly from `.next/standalone` locally, but the production image
is `node:22-alpine` — musl, not glibc — and that combination could not be
tested without Docker access. If it fails, the whole Phase 04 image pipeline
changes to a WASM codec, so this is worth knowing before anything is built on
it.

A successful build does not answer this. The route has to run.

Phase 00 is not complete while any row reads `Unverified`.

---

## 21. Package Scripts

At minimum:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  }
}
```

Adjust based on the selected current Next.js tooling.

Optional:

```text
typecheck
format
format:check
```

---

## 22. TypeScript Requirements

### Node Version

HelloDeploy builds on `node:22-alpine`. Pin local development to match:

```text
.nvmrc → 22
```

The machine this was reviewed on runs Node 20, so without a pin, development
and production differ by a major version — and the difference surfaces as a
native-module failure at runtime, not as a build error.

Use strict TypeScript settings unless a framework-specific reason requires otherwise.

Avoid:

```text
any
```

unless documented.

Shared types should live in:

```text
types/
```

Runtime validation must not depend on TypeScript alone.

Zod or equivalent runtime validation will be introduced as needed.

### Testing

Phase 00 needs no tests beyond the build succeeding.

Phase 02 introduces the test harness alongside the balance engine, because
that is the first code where a silent regression costs a user money. Do not
defer the harness past Phase 02 — Phase 14's deployment gate requires a test
command that actually runs something.

Choosing the framework in Phase 00 is fine if convenient; wiring it up is
Phase 02's job.

---

## 22a. Dependency Review

Run `npm audit` before committing the first lockfile, and treat a non-empty
result as a blocker rather than a note.

This is not theoretical: the first pinned version chosen for this project
(`next@15.5.4`) carried a critical RCE advisory. The 15.5.x line had moved to
backport maintenance, so the fix was to move to the current major rather than
to chase a patch on an old branch.

```text
Baseline: Next 16.3.5, React 19.1.1, Sharp 0.35.4, Tailwind 4.3.3
npm audit: 0 vulnerabilities
```

Do not start a greenfield project on a maintenance branch. `latest` is the
right default unless something concrete argues otherwise.

---

## 23. Linting and Formatting

Establish consistent:

- Indentation
- Quote style
- Import organization
- TypeScript linting
- React linting
- Unused variable detection

The repository should not start accumulating formatting inconsistency.

---

## 24. Error Handling Foundation

Add:

- Global not-found page
- Error boundary strategy
- User-friendly generic error state
- Development logging conventions

Do not expose stack traces or secrets in production UI.

---

## 25. Logging Foundation

Use a simple structured logging convention.

At minimum distinguish:

```text
info
warn
error
```

Never log:

- Supabase secret keys
- Authentication tokens
- User passwords
- Future private financial document contents

A more advanced observability system belongs to later phases.

---

## 26. Security Foundation

Phase 00 should already enforce:

- No secrets in client bundles
- No credentials in Git
- HTTPS assumed in production
- Safe environment handling
- Dependency review
- Basic security headers where appropriate

RBAC and RLS arrive in Phase 01.

---

## 27. Accessibility Foundation

Base UI should support:

- Keyboard navigation
- Visible focus states
- Proper labels
- Semantic HTML
- Adequate color contrast
- Buttons implemented as buttons
- Links implemented as links

Accessibility problems are easier to prevent than retrofit.

---

## 28. README Requirements

README should include:

### Project

```text
HelloPera
```

### Local Setup

- Clone repository
- Install dependencies
- Copy `.env.example` to `.env.local`
- Add Supabase credentials
- Run development server

### Commands

```text
npm run dev
npm run build
npm start
npm run lint
```

### Architecture Summary

Briefly state:

```text
Next.js + TypeScript + Tailwind
HelloDeploy for application hosting
Supabase for persistent backend services
```

### Phase Status

Indicate:

```text
Current Phase: Phase 00 — Project Foundation
```

---

## 29. Git Requirements

Suggested initial branch strategy:

```text
main
develop
feature/*
```

A simpler strategy is acceptable if preferred.

Do not commit:

- `.env.local`
- build output
- local development secrets
- temporary uploaded files

---

## 30. Initial `.gitignore`

Ensure it covers at least:

```text
node_modules
.next
.env
.env.local
*.log
```

plus standard Next.js and local tooling files.

---

## 31. Database Changes

Phase 00 should avoid building application schema.

No finance tables yet.

No transaction tables.

No plan/subscription tables.

If a minimal technical table is needed, document exactly why.

Financial schema creation begins in later phases.

---

## 32. Routes and Access

All Phase 00 application routes are placeholders.

Do not pretend `/dashboard` or `/admin` is secure yet.

Clearly document:

```text
Authentication and RBAC begin in Phase 01.
```

Do not deploy sensitive functionality before Phase 01 is complete.

---

## 33. UI Requirements

The Phase 00 visual shell should demonstrate:

- HelloPera Jade
- Responsive layout
- Light theme
- Dark theme
- Sidebar desktop navigation
- Bottom mobile navigation
- Card styling
- Typography hierarchy
- Button styles
- Status badge styles

Use mock data only.

Example mock cards:

```text
Total Balance
Monthly Income
Monthly Expenses
Upcoming Bills
```

No financial persistence should occur.

---

## 34. Mock Data Rule

Any temporary Phase 00 financial values must be clearly static development mock data.

They must not be confused with actual persistence.

Mock data should be easy to remove in Phase 02.

---

## 35. Testing Checklist

### Development

- [ ] Application starts locally
- [ ] No TypeScript compilation errors
- [ ] No lint errors
- [ ] Light theme works
- [ ] Dark theme works
- [ ] Mobile layout works
- [ ] Tablet layout works
- [ ] Desktop layout works
- [ ] Public shell loads
- [ ] Dashboard shell loads
- [ ] Admin shell loads
- [ ] Supabase connection configuration loads
- [ ] Missing environment variables generate a clear error

### Production Build

- [ ] `npm run build` succeeds
- [ ] `npm start` succeeds
- [ ] Static assets load
- [ ] Direct route refresh works
- [ ] No environment secrets appear in browser source
- [ ] Production console contains no avoidable errors

### PWA

- [ ] Manifest loads
- [ ] App name is correct
- [ ] Theme color is correct
- [ ] Icons resolve
- [ ] Standalone display configuration exists
- [ ] App is structurally installability-ready

### Accessibility

- [ ] Keyboard navigation works
- [ ] Focus state visible
- [ ] Form controls have labels
- [ ] Contrast is acceptable
- [ ] Navigation uses semantic elements

---

## 36. HelloDeploy Deployment Checks

- [ ] Every row in `PLATFORM-HELLODEPLOY.md` is Verified or has a chosen fallback
- [ ] Row S1 (scheduled invocation) resolved — the highest-risk assumption
- [ ] Row E1 (no server secret in the client bundle) confirmed by grepping the build
- [ ] Repository deploys successfully
- [ ] Node.js runtime is compatible
- [ ] Install command succeeds
- [ ] Build command succeeds
- [ ] Start command succeeds
- [ ] Production environment variables are available
- [ ] Cloudflare routing works
- [ ] HTTPS works
- [ ] Static assets work through proxy
- [ ] No permanent user data is written to local application storage

---

## 37. Acceptance Criteria

Phase 00 is complete only if all of the following are true:

1. HelloPera runs locally using Next.js and TypeScript.
2. Tailwind is configured and functioning.
3. HelloPera Jade is implemented using centralized design tokens.
4. Light and dark theme foundations work.
5. The UI is responsive on mobile and desktop.
6. Public, app, and admin shells exist.
7. Supabase environment configuration is connected correctly.
8. The repository contains no real credentials.
9. PWA manifest and installability foundation exist.
10. Production build succeeds.
11. HelloDeploy can run the production build.
12. The HelloDeploy capability matrix is fully resolved.
13. Light-theme text tokens are verified at WCAG 2.2 AA.
14. The README documents local setup and deployment basics.
15. No Phase 01 or later business logic has been prematurely implemented.

---

## 38. Definition of Done

Phase 00 is considered done when:

```text
The HelloPera project foundation is stable,
branded,
responsive,
PWA-ready,
Supabase-connected,
and deployable through HelloDeploy.
```

The project should be ready to begin:

```text
Phase 01 — Authentication, Google OAuth, RBAC and Security
```

Do not proceed to Phase 01 until all Phase 00 acceptance criteria pass.
