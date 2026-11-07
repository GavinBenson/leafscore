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

**Remaining (DNS owner):** add at the `tea-ratings.com` DNS host, then click Verify in Resend:
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

## PBI 11 — Lint clean + CI · P3 · New

`npm run lint` fails (`any` in session callback, `<a>` instead of `<Link>` in Journal, unused vars).
- Type session via `next-auth` module augmentation; drop `as any` in `lib/auth.ts` and `lib/session.ts`.
- GitHub Action: typecheck, lint, test on PR.

## PBI 12 — Proper OAuth account linking · P3 · New

Tech debt from PBI 1: no `accounts` table, so Google accounts match users by email only.
- Add `accounts` table + migration; implement `getUserByAccount` / `linkAccount`.
- Settings: show connected sign-in methods.

## PBI 13 — Replace boilerplate README · P3 · New

README is create-next-app default. Document setup, env vars, DB migrate/seed, Stripe + Resend local testing.
