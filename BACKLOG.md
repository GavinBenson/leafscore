# LeafScore Backlog

Status: `Done` · `Ready` · `New`. Priority: P1 (broken/blocking) → P3 (nice to have).

---

## PBI 1 — Fix sign-in, Log, and Journal errors · P1 · Done

**Problem:** Every `/api/auth/*` route returned 500 (`MissingAdapterMethods: getUserByEmail`). Sign-in, session lookup, `/log`, `/journal`, and `/settings` were all broken for everyone. The custom Auth.js adapter only implemented verification-token methods, and adding an adapter silently switched sessions to the `database` strategy.

**Fix:**
- `lib/auth.ts`: full minimal adapter over the `users` table; `session.strategy: 'jwt'`; Google trusted for email linking; verification token consumed atomically (`DELETE … RETURNING`).
- User rows are no longer created when someone merely *requests* a magic link (was in `signIn` callback). Google name/avatar still refreshed via `events.signIn`.
- Sign-in redirects now carry `callbackUrl` so users land back on `/log`, `/journal`, `/settings`, `/settings/billing`.
- Settings "Sign Out" posted to `/api/auth/signout` without a CSRF token (failed with `MissingCSRF`); now uses a server action.

**Acceptance:** `/api/auth/signin|session|providers` return 200; signed-in `/log`, `/journal` (all tabs), `/settings` render; signed-out redirects include `callbackUrl`. Verified locally.

---

## PBI 2 — Branded sign-in page · P1 · Done

Default Auth.js page is unstyled and labels magic link as "Sign in with Resend".
- Custom `/signin` page (`pages.signIn`) using design tokens, light/dark, 375px.
- "Continue with Google" + "Email me a sign-in link"; "Check your email" state; friendly error messages (`?error=`).
- Preserve full destination incl. query (e.g. `/log?tea=12` currently loses `tea`).

**Done:** `app/signin/page.tsx` + `components/SignInForm.tsx`; Auth.js `pages.signIn`/`pages.error` point at it. Callback URLs sanitised to same-site paths (`lib/authRedirect.ts`, with tests). Nav "Sign in" links straight to `/signin?callbackUrl=<current page>`.

## PBI 3 — Verify magic-link email delivery · P1 · Blocked (DNS)

Sender defaults to `noreply@tea-ratings.com`; Resend rejects unverified domains.
- Verify domain in Resend (or set `AUTH_RESEND_FROM`); add `AUTH_RESEND_FROM` to `.env.example`.
- Branded email template (`sendVerificationRequest`).
- Send a real link end-to-end in dev and prod.

**Finding:** Resend reports `tea-ratings.com` status `failed`; none of the records exist in DNS, so every magic-link send returns `403 domain is not verified`. Magic-link sign-in has never worked.

**Done in code:** branded email (`lib/email/magicLink.ts`), `AUTH_RESEND_FROM` in `.env.example`, send failures show a friendly error instead of an error page. Verified the "Check your email" path with Resend's sandbox sender (`onboarding@resend.dev` → `delivered@resend.dev`).

`.env.example` was gitignored, so it never reached the repo. Fixed in PBI 13.

**Remaining (DNS owner):** checked 2026-11-06 and none of these records exist yet. Add them at the `tea-ratings.com` DNS host, then click Verify in Resend and send a real link:
| Type | Name | Value |
|---|---|---|
| TXT | `resend._domainkey` | DKIM key from Resend dashboard |
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com` (priority 10) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` |

## PBI 14 — Mobile navbar overflows; Sign in hidden at 375px · P1 · Done

Found while testing PBI 2. At 375px the topbar (brand + 4 links + theme toggle + Sign in) is wider than the viewport: page scrolls horizontally and the Sign in / avatar controls are off-screen.
- Mobile nav pattern (bottom tab bar or menu) under 640px; account control always visible.
- No horizontal scroll at 375px on any page.

**Done:** Bottom tab bar under 640px; the account control collapses to an avatar linking to `/settings`, so it is always on screen. Checked in Edge at 375px on every public, signed-in and admin page: no horizontal scroll.

## PBI 4 — Review form validation + error states · P2 · Done

`submitReview` trusts FormData: no score bounds, `teaId` can be `NaN`, `brewMethod` is cast not checked, errors throw raw.
- Validate server-side (score 0–100, known tea, enum values, temp/time ranges).
- Show inline errors via `useActionState`; pending state on submit button.
- Prevent duplicate submit.

**Done:** Server-side validation in `lib/validation/review.ts` (with unit tests), known-tea and known-tag checks in the action, inline errors through `useActionState` that keep what the user typed, pending state on the submit button, and a 30-second server-side guard against identical double submits.

## PBI 5 — Edit a review · P2 · Done

Reviews can only be created or deleted.
- Edit action + page from Journal and tea page; recompute tea `leafScore`.

**Done:** Edit page at `/reviews/[id]/edit` reusing `ReviewForm`, with Edit and Delete controls on the Journal and tea pages. Only the author sees them; anyone else gets a 404. Saving recomputes `leafScore`. Also gave `removeReview` the UI it never had, and Journal cards now name the tea instead of saying Anonymous.

## PBI 6 — Review photos · P2 · Done

`reviews.photo_url` column and `BLOB_READ_WRITE_TOKEN` exist, but no upload UI and `@vercel/blob` is unused.
- Upload on review form (size/type limits), show on `ReviewCard`.

**Done:** Upload on the review form with a 4MB limit; JPEG, PNG and WebP only, checked from the file's bytes. Photos show on `ReviewCard`, and replacing or removing one, or deleting its review, also deletes the old blob. Tested locally against a fake Blob API, not real Vercel Blob. Production needs `BLOB_READ_WRITE_TOKEN` set.

## PBI 7 — Define what Premium unlocks · P2 · Done

Stripe checkout works, but `isPremium` gates nothing outside settings.
- Decide premium features (e.g. brew-session stats, export, unlimited wishlist, ad-free).
- Gate them; show upsell for free users.

**Done:** Decision (easy to change, in `lib/premium.ts`): Premium unlocks brew stats (`/journal/stats`), CSV export (`/journal/export`) and an unlimited wishlist; free accounts hold 25 teas. Ad-free was dropped because the site has no ads. Free users see an upsell, and the billing page lists the features. Also added the Favorite and Wishlist buttons on the tea page: the actions existed but had no UI, so those Journal tabs could never fill.

## PBI 8 — Harden Stripe webhook · P2 · Done

- Handle `customer.subscription.updated` and `invoice.payment_failed`.
- Set `premiumExpiresAt` from `current_period_end` (never written today).
- Idempotency on repeated events.

**Done:** Handles `customer.subscription.updated` and `invoice.payment_failed`, re-reads each subscription from Stripe so out-of-order events cannot leave stale state, writes `premiumExpiresAt` from the period end, and ignores repeats through a new `stripe_events` table (a failed event releases its claim so the retry runs). Premium ends a day after expiry if a cancellation webhook is missed. The billing page warns about failed payments. Also fixed Manage Subscription showing raw JSON, Subscribe sticking on Redirecting..., and resubscribing creating a second Stripe customer. Tested with a fake subscription lookup, not real Stripe. **Deploy:** run the migration, and enable all four events on the Stripe webhook endpoint: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

## PBI 9 — Public profiles · P3 · Done

`users.profile_public` exists but unused.
- `/u/[id]` page: public reviews, favorites; privacy toggle in Settings.

**Done:** Public profile page at `/u/[id]` with reviews and favorites, and a privacy toggle in Settings. Only id, name and avatar are selected, so email cannot leak. A private profile returns the same 404 as a missing one, except to its owner. Tea pages link to public authors only. Note: `profile_public` defaults to true, so accounts are public until their owner changes it.

## PBI 10 — Tests · P2 · Done

Vitest + PGlite `db/testDb.ts` are set up, zero tests exist.
- Data-layer tests (`lib/data/*`), auth adapter tests, review action tests.
- Would have caught PBI 1.

**Done:** 94 tests against in-process Postgres (PGlite) cover the data layer (`lib/data/*`), the auth adapter (extracted to `lib/authAdapter.ts` so it can be tested) and the review actions, including ownership checks and double submits. The adapter test asserts every method Auth.js needs, which would have caught PBI 1.

## PBI 11 — Lint clean + CI · P3 · Done

`npm run lint` fails (`any` in session callback, `<a>` instead of `<Link>` in Journal, unused vars).
- Type session via `next-auth` module augmentation; drop `as any` in `lib/auth.ts` and `lib/session.ts`.
- GitHub Action: typecheck, lint, test on PR.

**Done:** `npm run lint` passes with zero errors and zero warnings. Session types come from `next-auth` module augmentation (`types/next-auth.d.ts`), with no `any` left in `lib/auth.ts` or `lib/session.ts`. `ThemeToggle` moved to `useSyncExternalStore`. GitHub Action runs typecheck, lint (warnings fail) and tests on every PR. Also fixed `getCurrentUser` returning a user with no id when the user row no longer exists.

## PBI 12 — Proper OAuth account linking · P3 · Done

Tech debt from PBI 1: no `accounts` table, so Google accounts match users by email only.
- Add `accounts` table + migration; implement `getUserByAccount` / `linkAccount`.
- Settings: show connected sign-in methods.

**Done:** New `accounts` table and migration; `getUserByAccount` and `linkAccount` implemented. OAuth tokens are deliberately not stored. Sessions now look users up by id, so a changed Google email cannot detach a session or create a duplicate user. Settings shows connected sign-in methods. Existing Google users link on their next sign-in. Also fixed the sign-in event, which rewrote users' names from their own row instead of the Google profile. Tested at the adapter and session level, not against real Google.

## PBI 13 — Replace boilerplate README · P3 · Done

README is create-next-app default. Document setup, env vars, DB migrate/seed, Stripe + Resend local testing.

**Done:** README covers setup, every environment variable, database migrate and seed, and local testing of Google, Resend and Stripe, plus the deploy order. Added the `.env.example` the gitignore had been excluding.

---

# PBIs 15-51 (added 2026-11-08 from five-perspective review and feature ideas)

Sources: user walkthrough, fuzzer, UI/UX designer, product manager, architect, then an independent review of the implementation. Feature PBIs 40-51 are product ideas grounded in existing data.


## PBI 15 — "Top Rated" lists unreviewed teas first · P1 · Built
**Problem:** `leafScore` is nullable and null until the first review. `listTeas` sorts `desc(leafScore)` with no NULLS LAST, and Postgres sorts NULLs first on DESC. Home "Top Rated" and the default `/browse` sort open with unscored teas. There is no tie-break, so offset paging is unstable.
**Evidence:** `lib/data/teas.ts:31-32`, `db/schema.ts:47`, `db/seed.ts` (sets no scores), `app/page.tsx`.
**Acceptance:** scored teas first (`NULLS LAST`), tie-break on review count then id; Top Rated hides teas with no reviews; test covers null ordering and stable paging.

## PBI 16 — Tea request flow end to end · P1 · Built
**Problem:** `submitTeaRequest` is called from nowhere in `app/` or `components/`, so users whose tea is missing hit a dead end and the admin queue can never fill. Even for admins, approving only flips `status`: no tea is created and the requester is never told. The action trusts FormData (`as string`), so a missing name throws a raw DB error and a huge name is accepted. Requests are unbounded per user, and `/admin/requests` does one user lookup per row.
**Evidence:** `actions/teaRequests.ts:11-34`, `components/TeaSearch.tsx:33`, `app/admin/requests/page.tsx`.
**Acceptance:** "Can't find your tea? Request it" on empty tea search, empty `/browse` and `/log`; validated input (trimmed name 1-120, capped brand/type, cap on pending requests, duplicate check) returning form state instead of throwing; Approve prefills `/admin/teas/new`; users see their request status; batched user lookup in the admin list.

## PBI 17 — Review integrity: one review per tea, fair scoring · P1 · Built
**Problem:** There is no unique `(user_id, tea_id)`; the only guard is a racy 30-second duplicate check. A user can post many reviews of one tea and each counts. `recalcLeafScore` is a plain average, so one 100 on a new tea shows as 100. There is no CHECK on score.
**Evidence:** `actions/reviews.ts:79-85, 129-146`, `lib/data/teas.ts:107-126`, `db/schema.ts`.
**Acceptance:** decide policy (default: one review per user per tea, with edit; "re-tasting" optional). Add a unique index and CHECK on score. Show the score only from N reviews (suggest 3) or use a Bayesian average, shown with the review count. Tea page shows "you already reviewed this" with an edit link. Tests cover the unique violation and the minimum count.

## PBI 18 — Atomic review writes and score recompute · P1 · Built
**Problem:** The DB client is `drizzle-orm/neon-http`, which has no transactions. Create is insert review, insert tags, then recompute; update is update, delete tags, re-insert tags, recompute. A failure midway leaves a review with no tags or a stale `leafScore`/`reviewCount`, and two concurrent reviews can write an older average last. Uploads happen before the DB write, so a failed write leaves an orphan public blob.
**Evidence:** `db/client.ts`, `lib/data/reviews.ts:203-258`, `lib/data/teas.ts:107-126`, `actions/reviews.ts:139, 204`.
**Acceptance:** switch the writes to `db.batch()` or the neon-serverless Pool with real transactions; recompute as a single `UPDATE teas SET leaf_score=(SELECT avg…), review_count=(SELECT count…)`; upload after insert or delete the blob on failure; concurrency test.

## PBI 19 — Upgrade vulnerable dependencies · P1 · Built
**Problem:** `npm audit --omit=dev` reports 11 vulnerabilities (1 critical, 9 high, 1 moderate). The critical is in `next` (pinned 16.2.10, fix 16.4.5 or later). Others: `sharp`, `undici`, `postcss`, `zod`, `nanoid`, `source-map-js`, and `@vercel/blob` via `@vercel/oidc`.
**Acceptance:** bump `next`, `eslint-config-next`, `@vercel/blob`, run `npm audit fix`; install, typecheck, lint, test and build all pass; `npm audit --omit=dev --audit-level=high` clean. Read `node_modules/next/dist/docs/` for breaking changes first (see AGENTS.md).

## PBI 20 — Legal pages, account deletion, display name · P1 · Built
**Problem:** There are no terms, privacy or cookie pages. Settings has no delete-account or data export, and the display name cannot be edited. Magic-link users get `name = email.split('@')[0]`, shown publicly on reviews even when their profile is private, which leaks part of the email. Most foreign keys have no `onDelete`, so deleting a user is impossible. These are needed for Stripe and Google OAuth verification and for GDPR/CCPA.
**Evidence:** `app/settings/page.tsx:136-145`, `lib/authAdapter.ts:112`, `components/ReviewCard.tsx:353-357`, `db/schema.ts`.
**Acceptance:** `/terms`, `/privacy` and footer links; editable display name with a neutral default ("Tea drinker NNNN"); "Delete my account" that cancels the Stripe subscription and removes or anonymises rows and blobs (decide per table); data export for free users; `profile_public` default reviewed.

## PBI 21 — Report and moderation tools · P1 · Built
**Problem:** Reviews have free-text notes and public photos, and nobody but the author can act on them. No report button, no `reports` table, and admins cannot view or delete reviews or ban users.
**Evidence:** `components/ReviewCard.tsx:115`, `db/schema.ts`, `app/admin/` (teas and requests only).
**Acceptance:** "Report" on reviews and profiles; `reports` table; admin queue to hide or delete a review (and its blob) and ban a user; tests for the authorization paths.

## PBI 22 — Rate limits and abuse controls · P1 · Built
**Problem:** There is no throttling on magic-link requests (mail-bomb any address, burn the Resend quota), the public `/api/teas/search` (no max `q` length, returns full rows), tea requests, reviews, 4MB photo uploads, favorites or wishlist.
**Evidence:** `actions/auth.ts:69-103`, `lib/auth.ts:15-31`, `app/api/teas/search/route.ts:5-10`, `actions/teaRequests.ts`, `lib/photos.ts:5-12`.
**Acceptance:** shared per-IP and per-user limiter on these entry points; per-email throttle plus a bot challenge on magic links; `q` capped at about 100 characters; daily caps on reviews, photos and favorites; friendly error states.

---


## PBI 23 — Input validation sweep · P2 · Built
**Problem:** Many inputs are cast, not validated. `/browse/abc`, `/browse/1.5`, `/brands/NaN`, `/browse?page=1.3`, `?page=1e20` and `/log?tea=1e99` send bad values to Postgres and 500 instead of 404 or a clamped value. `toggleFavorite` and `toggleWishlist` trust a client `teaId`. Admin `createTea` accepts empty names, NaN brand ids and arbitrary enum text; `handleTeaRequest` does not check `status`. `deleteTea` fails with a raw FK error on a reviewed tea. The wishlist limit check is not atomic. There is no central env validation: `STRIPE_WEBHOOK_SECRET!`, price-id fallbacks (`price_monthly`) and `localhost:3000` redirect fallbacks can reach production.
**Acceptance:** shared safe-integer id parser (as `app/u/[id]/page.tsx` already does) with `notFound()` and page clamping; zod or manual validators for admin, favorites, wishlist and request actions; atomic conditional insert for the wishlist cap; `lib/env.ts` parsed at boot with no production fallbacks.

## PBI 24 — Branded error, not-found and loading pages · P2 · Built
**Problem:** There is no `not-found.tsx`, `error.tsx`, `global-error.tsx` or `loading.tsx`, so bad URLs and DB errors show framework pages and slow pages show nothing. Logging is `console.error` only; webhook failures would go unnoticed.
**Acceptance:** branded not-found and error pages (with retry), skeleton `loading.tsx` for browse and tea pages, error reporter wired through `instrumentation.ts`.

## PBI 25 — Accessibility: contrast, focus, form labels · P2 · Built
**Problem:** (a) White text on the dark-mode green primary is about 2.6:1 (`globals.css:152, 171-173`). (b) `--color-ink-3` is about 3.2:1 light and 3.9:1 dark; the mid score badge is about 3.2:1. (c) There are no `:focus-visible` styles and `.field:focus` sets `outline:none`. (d) Review form labels are not tied to controls (`ReviewForm.tsx:101-331`), `TeaSearch` has no label, and errors lack `aria-describedby`.
**Acceptance:** `--color-on-primary` token and darker/lighter ink-3 and amber text values meeting WCAG AA in both themes; global `:focus-visible` outline; every control has an id plus matching `htmlFor`, errors linked; checked with an automated audit (axe) at 375px.

## PBI 26 — Accessibility: widgets and motion · P2 · Built
**Problem:** The tea picker is a plain input plus buttons with no combobox roles, arrow keys, Escape or "no results" text. Flavor tag and filter chips are 24px tall with no `aria-pressed`. The score badge relies on colour with no accessible name. After a failed submit focus stays at the bottom of the form. There is no `prefers-reduced-motion` handling, and card hover lift fires on non-interactive cards. The 0-100 slider has no scale labels or numeric input.
**Acceptance:** ARIA combobox for the picker; 44px targets and `aria-pressed` on chips; `aria-label="LeafScore 82 out of 100"` plus a tier word on the badge; focus moves to the first invalid field; reduced-motion media query; slider gets labels or a number input.

## PBI 27 — SEO and sharing · P2 · Built
**Problem:** Tea pages have no `generateMetadata`, so every title is "LeafScore"; no Open Graph or Twitter cards; no `metadataBase`; brand, browse and home pages have no metadata. The sitemap is capped at 1000 full rows with `lastModified: new Date()`. Robots and sitemap fall back to `https://leafscore.app` while email uses `tea-ratings.com`, so the canonical domain is unsettled. The tea JSON-LD is serialized unescaped into `dangerouslySetInnerHTML` (a name containing `</script>` breaks out), has no description, image or url, and `ratingValue` can fall outside the declared range.
**Acceptance:** per-page metadata with canonical and OG image for teas and brands; `metadataBase` from a validated env; JSON-LD escaped (`<` as `<`), complete and clamped; Share button on tea and review; sitemap selects only needed columns with real dates; canonical domain decided.

## PBI 28 — Browse and discovery · P2 · Built
**Problem:** `/browse` reads `?q=` but has no search box. Tea search matches name only, not brand. `listTeas` selects only `schema.teas`, so `tea.brand` is always undefined on cards. `/brands` is not in the nav and brand names are not links. Chips and sort have no labels, and empty results have no "Clear filters". There are no brand, subtype or origin filters even though the fields exist. After submitting a review the user gets no "log another" or "teas like this" prompt.
**Acceptance:** labelled search input, 44px chips and sort, "Clear filters"; join and link brand on cards and tea page, with Brands in the nav; search across brand and name; brand and subtype filters; post-review next-step prompt.

## PBI 29 — Journal and profile completeness · P2 · Built
**Problem:** `listReviewsForUser` defaults to 20 rows, so the 21st review vanishes from Journal and public profile. Favorites and wishlist are unordered and unpaged; the tea page loads every review at once. Favorites and wishlist can only be removed from the tea page, and free users see no "x of 25" counter. Review cards hide a time or temperature of 0 and omit flavor tags. `toLocaleDateString()` has no fixed locale (hydration mismatch risk).
**Acceptance:** paging or "load more" with explicit ordering on all lists, including tea-page reviews; remove and "log this tea" controls on Journal cards; wishlist counter; flavor tags on cards; null checks instead of truthy checks; fixed-locale dates.

## PBI 30 — Database indexes, search index, constraints · P2 · Built
**Problem:** The only indexes are uniques on favorites, wishlist, review_tags and verification tokens. Missing: `reviews(tea_id, created_at)`, `reviews(user_id, created_at)`, `teas(type, leaf_score)`, `teas(brand_id)`, `affiliate_links(tea_id)`, `review_tags(flavor_tag_id)`. Search is `ILIKE '%q%'` with no trigram index. Boolean and count columns are nullable; `brands.name` is not unique; `type` is free text.
**Acceptance:** migration adding the indexes above, `pg_trgm` and GIN on tea (and brand) name; `.notNull()` on defaulted columns; unique brand name; deliberate `onDelete` per FK (cascade or set null); friendly `deleteTea` error. Check query plans on seeded data.

## PBI 31 — CI, migration and deploy safety · P2 · Built
**Problem:** CI runs only install, typecheck, lint and tests. No `next build`, no migration check, no `npm audit`, no e2e. Migrations and seeding are manual, so a deploy can precede its schema. `db/seed.ts` has no production guard. No tests exist for pages, components, admin, favorites, wishlist, profile or tea-request actions, the checkout and search routes, `stats.ts` or `photos.ts`.
**Acceptance:** CI adds `npm run build` with dummy envs, `drizzle-kit generate --check` and `npm audit --omit=dev --audit-level=high`; migrations run as a gated deploy step with expand/contract notes; seed refuses production hosts; tests for admin authorization, search and checkout routes; one Playwright smoke test (browse, tea page, sign-in redirect); `import 'server-only'` on `db/client.ts`, `lib/stripe.ts` and `lib/photos.ts`.

## PBI 32 — Grow the catalogue · P2 · Built
**Problem:** The seed has about 36 teas across 15 brands, optional per the README. Only admins can add teas, one at a time. There is no bulk import, no tea images (`imageUrl` is unused) and no dedupe. An empty-feeling site cannot meet search or SEO demand.
**Acceptance:** CSV import script with dedupe by brand and name; 300-500 teas loaded before launch; launch checklist includes seed or import; optional tea images.

## PBI 33 — Billing clarity and Stripe edge cases · P2 · Built
**Problem:** The billing page always says "Current period ends…" with no renews-versus-cancels state (`cancel_at_period_end` not stored). `?success=true` shows "now active" from the URL alone before the webhook sets Premium, and a second checkout attempt then 409s. Brew stats and CSV export look free until clicked, and the export bounce to billing gives no explanation. Two tabs can start parallel subscriptions (new customer per session; `request.json()` throws on a bad body). Webhook gap: a crash after claiming an event makes the retry return "duplicate", and `invoice.payment_failed` for an unlinked customer is marked processed.
**Acceptance:** store `cancel_at_period_end` and show "Renews on" or "Cancels on"; "Activating…" state that refreshes until premium; "Premium" badges and a notice after the export bounce; reuse one Stripe customer, check for an active subscription, idempotency key, guarded body parse; claim row gets `processed_at` set only on success, and the unlinked-customer case returns 500 so Stripe retries.

## PBI 34 — Caching and rendering strategy · P2 · Built
**Problem:** The tea page calls `getCurrentUser()`, so it is fully dynamic and every view hits Neon. There is no `revalidate`, cache or tags. `refreshReviewPages` skips `/browse`, `/brands/*` and `/u/<id>`, and admin create and delete skip `/` and the sitemap. Verify against `node_modules/next/dist/docs/` before changing anything: this version's caching APIs may differ.
**Acceptance:** anonymous tea content cached with tags and per-user buttons split out, using the documented Next 16 mechanism; writes invalidate the right tags; stale-data test.

---


## PBI 35 — Analytics and admin metrics · P3 · Built
No analytics, error monitoring or business metrics; `/admin` shows three counts. **Acceptance:** privacy-friendly analytics, error monitoring (with PBI 24), and an admin card for signups, reviews and premium count.

## PBI 36 — Retention loop · P3 · Built
The only email is the magic link, with no follow, lists, digest or share. **Acceptance:** share link with an OG image, weekly "new top teas" email, post-review prompt (with PBI 28). Defer follows and lists.

## PBI 37 — Premium and affiliate monetization · P3 · Built
Premium is stats, export and a 25-tea wishlist cap, with no trial or promo codes, and the "Save 33%" label is hardcoded. The `affiliateLinks` table and "Where to Buy" UI exist, but no admin UI creates links and there is no FTC disclosure. **Acceptance:** trial and `allow_promotion_codes`; savings derived from prices; admin affiliate field, disclosure line and click tracking; consider soft-launching free-only.

## PBI 38 — Security headers and URL scheme checks · P3 · Built
`next.config.ts` has no `headers()`, and `link.url` and `brand.website` render as `href` with no scheme check (a latent `javascript:` XSS if an admin editor is ever added). **Acceptance:** CSP, `X-Frame-Options` and `nosniff`; require `https:` on insert and render.

## PBI 39 — Design-token cleanup and polish · P3 · Built
Tokens are copy-pasted three times in `globals.css`, with no type or spacing scale, scattered inline styles and hard-coded `#fff`. Smaller items: ThemeToggle icon flips after hydration and has a non-specific label, `FilterBar` is in a `Suspense` with a null fallback (layout shift), review photos have no aspect ratio, mobile hero padding is 80px, `window.confirm` is used for delete, and there is no home explainer or footer. **Acceptance:** `--space-*` and `--text-*` tokens, one dark block, utility classes for inline styles, fixed-height Suspense fallback, `aspect-ratio` on photos, home value-prop section and footer.

---


---

# New features (PBIs 40-51)

Product ideas, not review findings. Grounded in what the app already stores: reviews carry brew method, temperature, steep time and flavor tags; teas carry type, subtype, origin, caffeine level and leaf style; affiliate links now carry price fields; favorites, wishlist and the Premium gate exist. Nothing here has been built or checked against real users. Each needs a product decision where noted.

Dependencies on the work above: one review per user per tea and the 3-review minimum (PBIs 15, 17) shape any feature that reads scores; moderation and rate limiting (PBIs 21, 22) must stay in place before anything that adds user-written text.

<!-- cheap, built on existing data -->

## PBI 40 — Community brew guide on each tea page · P2 · Built
**Problem:** Reviews already record brew method, temperature and steep time, but the tea page never summarises them, so a new drinker has to read reviews to learn how to brew the tea.
**Scope:** Aggregate non-hidden reviews per tea into "Most drinkers brew this at 95°C for 3 min (gongfu, 12 brews)". Show the median and the interquartile range, the most common method, and the number of reviews behind it. Hide any figure with fewer than 3 reviews with that field. Cache with the tea page tags and invalidate on review writes.
**Acceptance:** one aggregate query with tests (outliers, nulls, ties, hidden reviews excluded); accessible display on the tea page; no new input fields; empty state when there is too little data.

## PBI 41 — Similar teas · P2 · Built
**Problem:** After a user reviews a tea there is no reason to log a second one, and tea pages are dead ends.
**Scope:** "Teas like this" on the tea page and on the post-review banner: rank other teas by overlap of the flavor tags reviewers applied, then same type, origin and subtype. Only teas with a public score. Start with a plain SQL similarity score; no ML.
**Acceptance:** similarity function with tests; at most 6 results; excludes the current tea and hidden reviews; cached and tagged; falls back to same-type top teas when tag data is thin.

## PBI 42 — Units: °C/°F and grams/ounces · P2 · Built
**Problem:** The review form is Celsius-only, which is awkward for US users, and any weight fields would have the same problem.
**Scope:** A per-user unit preference (stored on the user, default from the browser locale on first save), applied in the review form, review cards, the brew guide (PBI 40) and the CSV export. Store values in °C and grams; convert only for display and input.
**Acceptance:** conversion helpers with round-trip tests; setting in Settings; the stored data never changes with the preference.

## PBI 43 — Blind-tasting mode · P2 · Built
**Problem:** Seeing the community score first anchors a rating.
**Scope:** An optional toggle on the review form ("Rate before seeing the score"): the community score and other reviews stay hidden on that tea page until the user has submitted. Default off. Remember the choice per user.
**Acceptance:** server-side hiding (not just CSS); no leak through the cached tea page data for this user; tests for the visibility rule.

<!-- retention and revenue -->

## PBI 44 — Curated lists / collections · P2 · Built
**Problem:** Users can favorite and wishlist, but cannot share a set ("Best oolongs under $20", "My morning teas"), and the site has no list pages that search engines can find.
**Scope:** Users create public or private lists of teas with a title and short description; list pages at `/lists/[id]` with metadata and share cards; a "Save to list" control on the tea page; free users get a small cap (for example 3 lists), Premium more. Reports and moderation (PBI 21) must cover list titles and descriptions. Rate limited.
**Acceptance:** schema and migration; ownership checks on every action; hidden or banned authors' public lists disappear; sitemap entries for public lists; tests for ownership and caps.

## PBI 45 — Tea cellar (Premium) · P2 · Built
**Problem:** Enthusiasts track what they own (amount left, purchase date, age for pu-erh), and nothing in the app supports it.
**Scope:** A private cellar per user: tea, grams or ounces owned (PBI 42), purchase date, price, optional notes; "low stock" threshold that offers to add the tea to the wishlist; Premium-gated like Brew stats; included in the data export and in account deletion.
**Acceptance:** schema and migration with cascade on user delete; Premium gate enforced server side; tests for the gate, export and deletion coverage.

## PBI 46 — Price per gram and vendor comparison · P3 · Built
**Problem:** The affiliate table now stores prices, but the tea page does not help a buyer compare.
**Scope:** Show price per 100 g for each affiliate link, sort links by it, and flag the cheapest; mark prices with a "last updated" date and a disclaimer that they may be stale. No scraping.
**Acceptance:** formatting and sorting helpers with tests; the commission disclosure stays next to the links; nothing shown when data is missing.

<!-- deeper engagement -->

## PBI 47 — Gongfu session logger and brew timer (Premium) · P3 · Built
**Problem:** Many serious tea drinkers brew in several short steeps, and the review form records only one brew.
**Scope:** A session mode with a timer and a per-infusion note and rating, saved as one session linked to a tea and optionally summarised in the review. Timer works offline in the page and does not depend on notifications. Premium or a free limited version.
**Acceptance:** schema for sessions and infusions; accessible timer (announces completion, works with the keyboard); no effect on the LeafScore unless the user links the session to a review.

## PBI 48 — Tea comparison · P3 · Built
**Problem:** Choosing between two or three teas means opening several tabs.
**Scope:** Compare up to 3 teas side by side: score and review count, flavor profile, brew guide (PBI 40), price per 100 g (PBI 46). Reachable from tea cards by a "Compare" toggle kept in the URL so it can be shared.
**Acceptance:** validated ids in the query string; works at 375px (stacked layout); tests for the data assembly.

## PBI 49 — Review helpfulness votes · P3 · Built
**Problem:** Reviews sort only by date; useful ones are not surfaced and there is no quality signal for reviewers.
**Scope:** A "helpful" vote on reviews written by others (one per user per review, not on your own), a "most helpful" sort on the tea page, and a count on the card. Rate limited and cleared when a review is deleted or hidden.
**Acceptance:** unique constraint on (user, review); no self-votes; stable sorting with ties; tests.

## PBI 50 — Taste profile and badges · P3 · Built
**Problem:** The Journal shows history but gives no sense of progress.
**Scope:** A flavor wheel from the user's own flavor tags, a "tea passport" by origin and type ("tried 8 of 20 origins"), and a small set of badges (first review, 10 oolongs, 5 origins). Computed on read from existing data; shown on the Journal and on public profiles if the profile is public.
**Acceptance:** pure aggregation functions with tests; respects the privacy toggle; no new write paths.

## PBI 51 — Structured tasting rubric (needs a product decision) · P3 · Built
**Problem:** One 0-100 number is easy to game and tells readers little.
**Scope:** Optional sub-scores (aroma, flavor, body, aftertaste, value) with the overall score either entered or derived. **Decision needed:** whether the LeafScore should use the overall number, a weighted rubric, or stay as is. Do not change how existing scores are computed without an explicit decision and a migration plan for old reviews.
**Acceptance:** after the decision, schema and validation, form UX with the accessibility patterns from PBIs 25-26, and tests; existing scores unchanged until the decision says otherwise.

## Considered and parked

- **Follow reviewers and an activity feed.** Needs enough users to be worth it, plus the moderation tooling to be proven first (it amplifies abuse). Revisit once there is real usage.
- **Verified vendor profiles and sample or discount codes.** A second revenue stream, but it needs brand verification, vendor reply moderation and a legal review. Revisit after the affiliate programme shows traction.

---

# Status after implementation (2026-11-08)

Status key: `Built` means the code is written, reviewed by independent reviewers, and passes typecheck, lint (zero warnings), the test suite (569 tests, PGlite and mocks), `next build` and a migration drift check. **Nothing has been run in a browser, against a real database, or against real Stripe, Resend, Vercel Blob, Google or Vercel cron.** Treat every PBI below as needing a staging pass before it is called Done.

## Needs a human (not code)

- **PBI 3 (DNS)** is still blocked: the three Resend records are not in DNS, so magic-link email still does not send.
- **Legal copy (PBI 20):** `/terms` and `/privacy` are drafts. The support address is a placeholder (`support@<your-domain>`), and the 13+ age limit, the refund wording and the last-updated date are guesses. Have a lawyer review before launch.
- **Canonical domain (PBI 27):** email uses `tea-ratings.com`, the SEO fallback uses `leafscore.app`. Decide, then set `NEXT_PUBLIC_APP_URL` in production.
- **Catalogue (PBI 32):** the importer and a 32-row sample exist. Reaching 300-500 teas needs data you curate or license. Review the sample CSV before importing.
- **Deploy order:** run migrations 0004, 0005 and 0006 before the new code goes live (the migration script is now transactional). Back up first: 0004 rewrites some names and removes duplicate reviews (backed up in `reviews_dedupe_backup`). Set `CRON_SECRET` (digest and maintenance crons), and optionally `STRIPE_TRIAL_DAYS` and `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`. Use Neon's pooled connection URL. Enable the Stripe webhook events listed under PBI 8.
- **Product decisions:** whether the rubric (PBI 51) should feed the LeafScore (it does not today); whether banned users may delete their accounts (see below).

## Known gaps and deviations

- **PBI 31:** no Playwright/e2e test. The CI workflow and its local Neon proxy image (unpinned tag) could not be run here.
- **Banned users** can download their data but cannot delete their account, because deleting it would erase the ban and allow re-registering. A proper fix needs a table of banned emails. A signed-out banned user cannot reach the export at all and needs a support route.
- **Digest (PBI 36):** a user whose send keeps failing sorts first on every run; more than 100 such users could starve the rest. Needs a schema change to fix.
- **PBI 34 (caching):** cache invalidation behaviour (`updateTag`, `unstable_cache`) is verified by reading the docs and unit tests with mocks, not at runtime.
- **PBI 43 (blind tasting):** the visible tea page hides community data, but the page's public metadata and share card still carry the score. Tea lists, search and the home page are not blind. The per-review toggle only sets the user's default.
- **PBI 46:** no price "last updated" date, because the schema has none; the page shows an out-of-date note instead.
- **PBI 45:** adding to the cellar goes through the tea page, not an in-page picker. The Premium upsell's feature list does not mention the cellar yet.
- **PBI 47:** delete always returns to the sessions list.
- **OG images** use the default Latin-only font (CJK tea names would not render).
- **Parked:** follow reviewers and an activity feed; verified vendor profiles and discount codes.

## Suggested order for what remains

1. Staging pass on a real Neon branch with Stripe test mode: migrations, sign-in, review flow, checkout, webhook, account deletion, digest, cron.
2. Resolve the human items above.
3. Browser accessibility pass (axe) and a 375px check of the mobile tab bar, tea page and compare page.
