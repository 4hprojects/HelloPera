# HelloPera — Phase 10: Public Website, Content, SEO and AdSense

## 1. Objective

Build HelloPera's public-facing website and content platform so the product can:

- Explain HelloPera clearly to new users
- Acquire users through organic search
- Publish useful personal-finance content
- Support Google AdSense review and future ad monetization
- Provide required trust, privacy, and support pages
- Keep advertising separate from sensitive financial workflows
- Preserve strong mobile performance and usability
- Provide a scalable SEO and content architecture

This phase does not activate paid subscriptions. It prepares the public side of HelloPera for growth and ad-supported monetization.

---

## 2. Dependencies

Phase 10 requires Phase 09 to be complete.

Required prior capabilities:

- Free/Premium entitlement model
- `ads_shown` entitlement
- User authentication
- Public Next.js shell
- HelloPera Jade design system
- PWA application
- HelloDeploy production deployment
- Feature flags
- Admin shell
- RLS/security foundations

---

## 3. Scope

### Included

- Public home page
- Features page
- About page
- Pricing/plan overview foundation
- Help page
- FAQ
- Contact page
- Privacy policy
- Terms of service
- Guides/content hub
- Blog/article architecture
- SEO metadata
- Sitemap
- robots.txt
- Canonical URLs
- Open Graph
- Structured data where appropriate
- Internal linking
- Content author metadata
- AdSense integration foundation
- Ad placement components
- Ad eligibility logic
- Premium ad suppression
- Consent/cookie architecture foundation
- Public analytics foundation
- Content admin foundation

### Out of Scope

Do not implement yet:

- Paid checkout
- Subscription payment provider
- Premium billing
- Affiliate marketing
- Sponsored content marketplace
- Native mobile ads
- Google AdMob
- Aggressive ad optimization
- Personalized financial advice articles generated without editorial review
- Large-scale CMS if simple content files/database are sufficient

---

## 4. Core Public Architecture

HelloPera should have two clearly separated experiences:

```text
Public Website
+
Authenticated Finance Application
```

Conceptual structure:

```text
hellopera domain
├── /
├── /features
├── /pricing
├── /about
├── /help
├── /faq
├── /guides
├── /blog
├── /privacy
├── /terms
├── /contact
└── /app or authenticated application routes
```

If the application continues to use `/dashboard` and related routes on the same domain, keep public and authenticated route groups clearly separated.

---

## 5. Public Website Purpose

The public site should provide real value even to a visitor who has not registered.

It should not be merely:

```text
Landing Page
↓
Sign Up
```

Public content should answer practical finance questions and explain the application clearly.

---

## 6. AdSense Readiness Principles

Design HelloPera so public pages have:

- Original content
- Useful information
- Clear navigation
- Functional pages
- Transparent product information
- Appropriate ad placement
- No deceptive layouts
- No excessive advertising

Do not design pages primarily to display ads.

---

## 7. Ad Placement Rule

Ads must not be visually confused with:

- Navigation
- Buttons
- Download links
- Transaction actions
- Financial forms
- Save/confirm controls

Never place an ad directly beside a control in a way that could produce accidental clicks.

---

## 8. Sensitive App Screens

Do not place standard AdSense units inside sensitive transactional workflows such as:

```text
Login
Registration
Upload Receipt
OCR Review
Confirm Transaction
Record Payment
Delete/Void Transaction
Account Settings
Subscription Checkout
```

Ad-supported areas should favor content-rich, non-transactional surfaces.

---

## 9. Recommended Ad Areas

Potential future locations:

```text
Public blog articles
Guides
Educational resources
Selected dashboard insight areas only if policy-compatible
Non-sensitive analytics/content sections
```

For MVP AdSense readiness, prioritize public content pages.

---

## 10. Premium Ad Suppression

Use Phase 09 entitlement:

```text
ads_shown
```

Free:

```text
true
```

Premium:

```text
false
```

Two independent controls, both of which must permit an ad before it renders:

```text
ads_shown            per-user entitlement   false for Premium
ads_enabled_global   feature flag           false kills all ads
```

Plus consent, where required (§49).

```text
render an ad only if:
  ads_enabled_global AND ads_shown AND consent allows advertising
```

Ad components check all three centrally. Do not scatter ad suppression logic
across pages — a page that forgets the check is a page that shows ads to a
paying subscriber.

---

## 11. Public Navigation

Suggested:

```text
Home
Features
Guides
Blog
Pricing
Help
About
```

Secondary/footer:

```text
Privacy
Terms
Contact
FAQ
Login
Create Account
```

Navigation should be simple and predictable.

---

## 12. Home Page

Suggested sections:

```text
Hero
Core Value
How HelloPera Works
Key Features
OCR / Document Capture
Bills and Receivables
Analytics
Forecasting
Security / Privacy
Free vs Premium
Useful Guides
CTA
Footer
```

Avoid overly long marketing copy.

---

## 13. Hero Messaging

Working direction:

```text
HelloPera
Your finances, organized.
```

Supporting idea:

```text
Track your money, bills, receivables, documents, and cash flow in one place.
```

Final copy can be refined later.

---

## 14. Features Page

Explain:

- Manual finance tracking
- Accounts
- Bills
- Receivables
- Receipt/screenshot capture
- OCR-assisted extraction
- Analytics
- Forecasting
- Notifications
- Privacy/security
- Premium capabilities

Do not promise functionality that is not yet available.

---

## 15. Pricing Page

Use Phase 09 plan data.

Show:

```text
Free
Premium
```

If Premium pricing is not finalized:

- Do not invent permanent pricing.
- Show `Coming Soon`, or
- Hide checkout CTA behind billing feature flag.

Do not show misleading discounts or fake urgency.

---

## 16. About Page

Should explain:

- What HelloPera is
- Why it exists
- Who it is for
- Product principles
- Privacy-first approach
- Contact/support path

Avoid fake team biographies.

---

## 17. Help Center

Route:

```text
/help
```

Potential topics:

```text
Getting Started
Accounts
Transactions
Bills
Receivables
Documents
OCR
Forecasting
Notifications
Privacy
Subscriptions
```

Can start with static content.

---

## 18. FAQ

Cover:

- Is HelloPera free?
- What files can I upload?
- Does HelloPera automatically change my finances from OCR?
- Is my financial data private?
- Can I use Google login?
- Does HelloPera support cash transactions?
- Can I track money people owe me?
- Can I track bills?
- Can I delete my data?
- What does Premium include?

Answers must match actual implementation.

---

## 19. Guides Hub

Route:

```text
/guides
```

Possible categories:

```text
Budgeting
Saving
Bills
Debt
Digital Wallets
Freelancing
Receivables
Cash Flow
Personal Finance Basics
Using HelloPera
```

---

## 20. Blog

Route:

```text
/blog
```

Use for:

- Product updates
- Finance education
- Practical tutorials
- New feature explanations

Do not create a thin news feed just for SEO.

---

## 21. Content Quality

Content should be:

- Original
- Useful
- Specific
- Accurate
- Reviewed
- Written for humans

Avoid:

- Keyword stuffing
- Thin pages
- Duplicated articles
- Mass-generated low-value content
- Pages that exist only for ads

---

## 22. Finance Content Accuracy

Personal-finance topics may affect real decisions.

Content should:

- Clearly distinguish education from personalized advice
- Use dates where rules/rates can change
- Cite authoritative sources where relevant
- Avoid unsupported investment promises
- Avoid guaranteed returns language

---

## 23. Content Authoring

Recommended initial options:

### Option A

Markdown/MDX files in repository.

### Option B

Database-backed article system.

For early HelloPera, MDX may be simpler.

If admin editing becomes important, database CMS can be introduced.

---

## 24. Suggested Article Schema

If database-backed:

```text
articles

id
slug
title
excerpt
content
status
author_id
category
featured_image
published_at
updated_at
seo_title
seo_description
canonical_url
created_at
```

Statuses:

```text
draft
published
archived
```

---

## 25. Author Metadata

Articles should show:

- Author/display name
- Published date
- Updated date where relevant

Do not fabricate credentials.

---

## 26. Article URL Structure

Recommended:

```text
/guides/<slug>
/blog/<slug>
```

Avoid deeply nested URLs unless needed.

---

## 27. Slugs

Requirements:

- Lowercase
- Hyphen-separated
- Stable
- Human-readable

Avoid dates in URL unless content model requires it.

---

## 28. SEO Metadata

Every indexable page should define:

```text
title
description
canonical
Open Graph
Twitter/social metadata where useful
```

Avoid duplicate titles/descriptions.

---

## 29. Title Pattern

Example:

```text
How to Track Monthly Expenses | HelloPera
```

Home:

```text
HelloPera — Personal Finance Tracking Made Simple
```

Working copy only.

---

## 30. Canonical URLs

Add canonical URLs to prevent duplicate indexing.

Especially for:

- Tracking parameters
- Pagination
- Filter variants

Do not canonicalize unrelated content incorrectly.

---

## 31. Sitemap

Create:

```text
/sitemap.xml
```

Include public indexable pages.

Exclude:

```text
/dashboard
/accounts
/transactions
/admin
/private user routes
```

---

## 32. robots.txt

Create:

```text
/robots.txt
```

Allow public content.

Disallow or prevent indexing of private application/admin paths where appropriate.

Do not rely on robots.txt as security.

---

## 33. Noindex Rules

Use `noindex` for:

```text
login
register
password reset
authenticated finance pages if publicly reachable
admin
internal search result pages where appropriate
```

Private routes should already require auth.

---

## 34. Structured Data

Use only valid, relevant schema.

Potential:

```text
Organization
WebSite
Article
BreadcrumbList
FAQPage when content qualifies
SoftwareApplication / WebApplication where appropriate
```

Do not add structured data that does not match visible content.

---

## 35. Open Graph

Support:

```text
og:title
og:description
og:image
og:url
og:type
```

Create consistent branded social preview assets.

---

## 36. Internal Linking

Articles should link naturally to:

- Relevant guides
- Related feature pages
- Help pages
- Registration where appropriate

Avoid excessive keyword-rich links.

---

## 37. Breadcrumbs

Use on:

```text
Guides
Blog
Help articles
```

Example:

```text
Home > Guides > Budgeting > Article
```

---

## 38. Search

Optional public content search:

```text
/guides?search=
```

Can be deferred.

Do not expose authenticated data through public search.

---

## 39. Content Categories

Suggested initial categories:

```text
Budgeting
Saving
Debt
Bills
Digital Wallets
Freelancing
Cash Flow
Personal Finance
HelloPera Tutorials
```

Avoid creating empty category pages.

---

## 40. Initial Content Target

Before applying for AdSense, HelloPera should have a meaningful body of original content.

Do not encode an arbitrary guaranteed article count.

Quality and usefulness matter more than a magic number.

Practical launch approach:

- Core product pages complete
- Legal/trust pages complete
- Several strong guides
- Several useful supporting articles
- No empty or placeholder sections

---

## 41. Content Publishing Workflow

Suggested:

```text
Draft
↓
Review
↓
SEO Check
↓
Publish
↓
Periodic Update
```

Finance content should have an update process.

---

## 42. Content Review Checklist

Before publish:

- Accurate
- Original
- Clear title
- Useful introduction
- Structured headings
- No unsupported claims
- Internal links
- Metadata
- Mobile readability
- Source links if needed
- Updated date if relevant

---

## 43. Contact Page

Route:

```text
/contact
```

Provide a genuine method to contact HelloPera.

Could include:

- Contact form
- Support email
- Product feedback

Protect form from spam.

---

## 44. Contact Form Security

Use:

- Rate limiting
- Validation
- CSRF-safe framework pattern
- Spam protection if needed

Do not publish unnecessary personal contact details.

---

## 45. Privacy Policy

Must explain, at minimum:

- What data HelloPera collects
- Authentication data
- Financial data
- Uploaded documents
- OCR processing
- Third-party processors
- Analytics
- Advertising
- Cookies/consent
- Data retention
- Account deletion
- Contact process

Policy must reflect actual implementation.

This is why account deletion and data export are in the pre-public-launch
gate (master plan §54a). A privacy policy describing a deletion path that
does not yet exist is not a drafting problem — it is a false statement
published to every visitor.

Before publishing, walk each claim in the policy and confirm the feature
behind it works today.

---

## 46. OCR Privacy Disclosure

Clearly describe that uploaded documents may be processed by configured OCR/AI providers.

Do not claim local-only processing if cloud processing is used.

---

## 47. Advertising Disclosure

Privacy policy should explain:

- Ad-supported Free tier
- Advertising technology
- Cookies/identifiers where applicable
- How users can manage consent where required

---

## 48. Terms of Service

Cover:

- Account responsibilities
- Acceptable use
- Financial-data accuracy
- OCR limitations
- No guarantee of financial advice
- Subscription terms foundation
- Account suspension
- Intellectual property
- Service availability
- Liability limitations as appropriate
- Termination

Legal text should ultimately receive proper legal review before commercial launch.

---

## 49. Cookie / Consent Architecture

Prepare consent management for:

- Analytics
- Advertising
- Optional third-party tracking

Do not load non-essential tracking before required consent where applicable.

Implementation should support:

```text
necessary
analytics
advertising
```

categories.

### Google Requires a Certified CMP for EEA and UK Traffic

Category modelling alone is not sufficient. To serve Google ads to users in
the EEA, UK or Switzerland, Google requires a **Consent Management Platform
certified by Google** and integrated with the IAB Transparency and Consent
Framework. A hand-rolled banner does not satisfy this, however correct its
categories.

Two paths — decide before applying for AdSense review:

1. **Adopt a certified CMP.** Google publishes the list; Google's own
   Privacy & Messaging tool is the lowest-friction option since it is
   configured from the AdSense account itself.
2. **Scope EEA/UK traffic out at launch.** Serve ads only to the primary
   market — Philippines and similar — and revisit when traffic justifies the
   integration.

For a Philippine-market product, option 2 is defensible at launch and
considerably less work. Whichever is chosen, record it here, and make sure
the privacy policy (§45) matches.

The consent categories above are still worth building either way: they are
what the CMP integrates with, and the analytics category applies regardless
of advertising.

---

## 50. Consent Storage

Store consent state with:

```text
version
timestamp
categories
```

Could be client-side cookie plus server record if needed.

---

## 51. Analytics

Use privacy-conscious analytics.

Potential:

```text
Google Analytics
```

or another analytics platform.

Track public-site behavior without mixing private financial values into analytics events.

---

## 52. Analytics Data Rule

Never send:

- Account balances
- Transaction amounts
- OCR text
- Bill values
- Receivable values
- Account numbers

to generic web analytics.

Use event names such as:

```text
signup_clicked
guide_viewed
pricing_viewed
```

---

## 53. Ad Components

Create centralized components:

```text
components/ads/
  ad-slot.tsx
  responsive-ad.tsx
```

Ad component responsibilities:

- Respect `ads_shown` (per-user) and `ads_enabled_global` (kill switch)
- Respect consent state
- Avoid restricted/sensitive screens
- Reserve layout space
- Prevent layout shift
- Allow ads feature flag to disable globally

---

## 54. Ad Feature Flag

Use:

```text
ads_enabled_global
```

or existing feature flag architecture.

If disabled:

```text
render nothing
```

without breaking layout.

---

## 55. AdSense Account Configuration

When ready:

- Add site to AdSense
- Complete verification
- Add required publisher identifiers/code
- Wait for site review
- Do not assume approval

This phase should prepare code but not claim approval.

---

## 56. ads.txt

When AdSense account provides publisher information, create:

```text
/ads.txt
```

Use exact authorized publisher ID.

Do not invent placeholder production publisher IDs.

---

## 57. Ad Script Loading

Load AdSense script only when:

- `ads_enabled_global` is true
- The user's `ads_shown` entitlement is true
- Consent rules allow it, per §49

Resolve all three **server-side** where possible, so a Premium user never
downloads the advertising script at all — not merely never sees a filled
slot.

Avoid loading advertising scripts for Premium users where practical.

---

## 58. Layout Shift

Reserve ad container space.

Do not allow ads to cause major content movement.

This supports usability and Core Web Vitals.

---

## 59. Ad Density

Keep ads secondary to content.

Do not overload articles.

Start conservative.

Example:

```text
One in-content ad
One lower-page ad
```

depending on article length and policy.

---

## 60. Ad Labels

If labels are used, use permitted neutral wording such as:

```text
Advertisement
Sponsored
```

Do not use labels that encourage clicking.

---

## 61. Prohibited UX Patterns

Do not:

- Place ads next to navigation buttons
- Make ads look like HelloPera menu items
- Put ads inside confirmation dialogs
- Place ads where accidental taps are likely
- Ask users to click ads
- Reward users for ad clicks
- Overlay ads over finance controls
- Put ads between form fields

---

## 62. Dashboard Ads

If ever enabled later:

Use only on non-critical, content-rich areas.

Do not include ads inside:

```text
transaction creation
bill payment
OCR confirmation
account editing
```

Public content remains the preferred monetization surface.

---

## 63. Public Performance

Targets:

- Fast LCP
- Stable CLS
- Responsive INP
- Optimized images
- Lazy-loaded non-critical media
- Minimal JavaScript on content pages

Do not ship the full authenticated finance application bundle to simple blog pages unnecessarily.

---

## 64. Image Optimization

Use Next.js image optimization where appropriate.

Public content images should:

- Use modern formats
- Have dimensions
- Lazy-load below fold
- Include meaningful alt text

---

## 65. Fonts

Avoid excessive webfont variants.

Prefer:

- System font stack, or
- One optimized brand font family

Performance matters for SEO and mobile visitors.

---

## 66. Public Site Accessibility

Require:

- Semantic headings
- Landmark navigation
- Keyboard access
- Skip links where useful
- Contrast
- Alt text
- Accessible forms
- Visible focus states

---

## 67. Article Accessibility

- Logical heading hierarchy
- Descriptive links
- Accessible tables
- Avoid text embedded in images
- Provide captions/context for charts

---

## 68. Content Admin

Phase 10 may extend:

```text
/admin/content
```

Capabilities:

- List articles
- Draft
- Publish
- Archive
- Edit metadata

If MDX is used, admin UI may remain minimal or deferred.

---

## 69. Content RBAC

Only admin can publish official HelloPera content.

Future editor role may be added later.

Do not broaden RBAC yet unless needed.

---

## 70. Public API Exposure

Public article endpoints should expose only published content.

Draft content must not appear in sitemap or public API.

---

## 71. Draft Preview

Optional:

```text
/admin/content/preview
```

must require admin.

---

## 72. SEO Validation

Before publishing:

- Unique title
- Unique description
- Canonical correct
- Indexability correct
- No broken links
- Structured data valid if used
- Images optimized
- Page mobile-friendly

---

## 73. Redirect Strategy

Use permanent redirects when changing published slugs.

Avoid creating duplicate content at old and new URLs.

---

## 74. 404 Page

Public 404 should:

- Match HelloPera branding
- Offer navigation
- Not contain misleading ads

---

## 75. Maintenance / Error Pages

Do not display ad units on:

- Error pages
- Empty maintenance pages
- Under-construction pages

---

## 76. Public Security

Apply:

- HTTPS
- CSP as practical
- Secure headers
- Form validation
- Rate limiting for contact forms
- Safe rendering of article content

If markdown HTML is allowed, sanitize it.

---

## 77. User-Generated Content

Not planned for Phase 10.

If comments/community are added later, ad policy and moderation must be reconsidered.

---

## 78. YMYL Consideration

Personal finance is a high-trust content area.

HelloPera should emphasize:

- Accuracy
- Source quality
- Updated content
- Clear authorship
- Clear distinction between general education and personalized financial advice

---

## 79. Content Disclaimer

Where appropriate:

```text
This content is for general educational purposes and does not constitute personalized financial advice.
```

Do not overuse disclaimers where unnecessary.

---

## 80. Initial Guide Ideas

Potential useful launch guides:

```text
How to Track Monthly Expenses
How to Organize Bills and Due Dates
How to Track Money People Owe You
How to Separate Transfers From Expenses
How to Track GCash and Cash Spending Together
How to Build a Simple Personal Cash-Flow Forecast
How to Keep Digital Receipts Organized
How to Track Freelance Income and Receivables
```

---

## 81. HelloPera Tutorial Ideas

```text
How to Create Your First Account in HelloPera
How to Record a Cash Expense
How to Upload a Receipt
How OCR Review Works
How to Track a Bill
How to Track a Receivable
How to Read Your HelloPera Dashboard
```

These support both SEO and product onboarding.

---

## 82. Content URL Indexing

Index:

```text
/
features
pricing
about
guides
blog
published articles
help pages where useful
```

Noindex:

```text
/login
/register
/admin
/dashboard
private financial routes
```

---

## 83. Sitemap Update

Automatically include newly published articles.

Exclude:

```text
draft
archived
private
```

---

## 84. Content Dates

Show:

```text
Published
Updated
```

when useful.

Search engines and users should not be misled by artificial date refreshing.

---

## 85. Content Freshness

Review content that depends on:

- Government rules
- Tax rules
- Interest rates
- App features
- Banking products
- Fees

Do not leave stale financial guidance unreviewed indefinitely.

---

## 86. Public Search Console Foundation

Prepare for:

```text
Google Search Console
```

After domain setup:

- Verify domain
- Submit sitemap
- Monitor indexing
- Monitor Core Web Vitals

---

## 87. AdSense Readiness Checklist

Before submitting HelloPera for review:

- Public site fully navigable
- No placeholder pages
- No lorem ipsum
- No broken navigation
- Original useful content published
- About page complete
- Contact path works
- Privacy page complete
- Terms page complete
- Mobile experience usable
- HTTPS active
- Ads do not mimic navigation
- No excessive ads
- Public content accessible to crawler
- Domain ownership stable
- Ad code configured correctly

---

## 88. Testing Checklist

### Public Site

- [ ] Home page works
- [ ] Features works
- [ ] Pricing works
- [ ] About works
- [ ] Help works
- [ ] FAQ works
- [ ] Contact works
- [ ] Privacy works
- [ ] Terms works
- [ ] Guides index works
- [ ] Blog index works

### Content

- [ ] Published article renders
- [ ] Draft is not public
- [ ] Archived article is not indexed
- [ ] Article metadata correct
- [ ] Author/date visible
- [ ] Internal links work

### SEO

- [ ] Unique metadata
- [ ] Canonical URLs correct
- [ ] Sitemap generated
- [ ] robots.txt generated
- [ ] Private app excluded
- [ ] Structured data valid
- [ ] Open Graph works
- [ ] 404 works

### Ads

- [ ] Ad component respects `ads_enabled_global`
- [ ] Ad component respects per-user `ads_shown`
- [ ] Premium sees no ads, and does not load the ad script
- [ ] Free eligible user can see configured ad slots
- [ ] Ads not shown in sensitive transaction flows
- [ ] Ads do not resemble navigation
- [ ] Ad containers reserve space
- [ ] Consent respected
- [ ] Global disable works

### Privacy

- [ ] No financial data sent to web analytics
- [ ] Privacy policy matches implementation
- [ ] OCR processing disclosure exists
- [ ] Advertising disclosure exists
- [ ] Consent state stored correctly
- [ ] CMP decision from §49 recorded and implemented

### Accessibility

- [ ] Public navigation keyboard accessible
- [ ] Heading hierarchy valid
- [ ] Forms labeled
- [ ] Images have alt text
- [ ] Focus visible
- [ ] Article tables accessible

### Performance

- [ ] Mobile pages load quickly
- [ ] Images optimized
- [ ] No unnecessary app bundle on content pages
- [ ] Ad script does not block critical rendering excessively
- [ ] Layout remains stable

### Production

- [ ] HelloDeploy build succeeds
- [ ] Public routes work
- [ ] Sitemap available
- [ ] robots.txt available
- [ ] HTTPS active
- [ ] Search Console verification possible
- [ ] AdSense script can be feature-flagged

---

## 89. Deployment Checks

Before completing Phase 10:

- [ ] **Pre-public-launch gate passed** (master plan §54a) — backup confirmed,
      restore tested, account deletion working, data export working, auth
      rate limiting active
- [ ] Public navigation finalized
- [ ] Legal/trust pages published
- [ ] Content system deployed
- [ ] SEO metadata deployed
- [ ] Sitemap deployed
- [ ] robots.txt deployed
- [ ] Canonical logic verified
- [ ] Public analytics configured
- [ ] Consent architecture configured
- [ ] Ad components deployed but safely controllable
- [ ] Premium ad suppression tested
- [ ] Private app routes excluded from indexing
- [ ] Production performance reviewed
- [ ] HelloDeploy deployment succeeds

---

## 90. Acceptance Criteria

Phase 10 is complete only when:

1. HelloPera has a complete public home page.
2. Features, About, Help, FAQ, Contact, Privacy, and Terms pages exist.
3. Guides and/or blog architecture is functional.
4. Published content is original and useful.
5. Draft content cannot leak publicly.
6. Public navigation is clear and functional.
7. Public pages have unique SEO metadata.
8. Sitemap works.
9. robots.txt works.
10. Canonical URLs are correct.
11. Private application routes are not indexed.
12. Structured data is used only where valid.
13. Open Graph metadata works.
14. Public pages are responsive and accessible.
15. Public pages meet reasonable performance standards.
16. Ad components respect `ads_shown` and `ads_enabled_global`.
17. Premium users do not receive ads.
18. Ads are not placed in sensitive financial workflows.
19. Ads cannot be mistaken for navigation or app controls.
20. Consent architecture can control advertising/analytics scripts.
21. The EEA/UK consent decision from §49 is made and implemented.
22. The pre-public-launch gate has passed before anything is published.
23. Privacy policy accurately describes document/OCR/ad processing, and
    describes only deletion and retention that actually work.
24. No private financial data is sent to generic web analytics.
25. HelloPera is structurally ready for AdSense site review.
26. AdSense approval is not assumed or hardcoded as a requirement for application functionality.

---

## 91. Definition of Done

Phase 10 is considered done when:

```text
HelloPera has a complete,
useful,
indexable,
high-quality public website
with original finance content,
clear trust and legal pages,
strong SEO foundations,
and policy-conscious ad infrastructure
that remains separate from sensitive financial workflows.
```

The application should then be ready to begin:

```text
Phase 11 — Premium Billing
```

Do not proceed to Phase 11 until all Phase 10 acceptance criteria pass.
