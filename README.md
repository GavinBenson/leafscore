# LeafScore

A community tea rating site. Browse teas, log tastings with scores and brew details, and keep a journal of reviews, favorites and a wishlist.

Built with Next.js 16 (App Router), React 19, Tailwind 4, Drizzle ORM on Neon Postgres, Auth.js v5, Stripe, Resend and Vercel Blob. The product backlog is in [`BACKLOG.md`](./BACKLOG.md).

## Setup

You need Node.js 20.9 or newer and a Postgres database ([Neon](https://neon.tech) is what production uses; its serverless driver is required).

```bash
npm install
cp .env.example .env.local   # then fill it in, see below
npm run db:migrate
npm run db:seed              # optional: sample brands, teas and flavor tags
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

[`.env.example`](./.env.example) lists them all. To get the site running you need `DATABASE_URL`, `AUTH_SECRET` and one sign-in method.

| Variable | Needed for | Where it comes from |
|---|---|---|
| `DATABASE_URL` | Everything | Neon connection string (use the pooled `-pooler` host at runtime) |
| `AUTH_SECRET` | Sign-in | `npx auth secret` |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | Google sign-in | Google Cloud OAuth client |
| `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` | Magic-link email | Resend API key and a verified sender |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Premium | Stripe dashboard, or `stripe listen` locally |
| `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_YEARLY_PRICE_ID` | Premium | Stripe recurring prices |
| `BLOB_READ_WRITE_TOKEN` | Review photos | Vercel Blob store |
| `CRON_SECRET` | Weekly digest cron | Any long random string. Vercel Cron sends it as `Authorization: Bearer <secret>`. Unset means `/api/cron/digest` returns 500 and never runs |
| `STRIPE_TRIAL_DAYS` | Optional free trial | Integer 0-30, default 0 (no trial) |
| `NEXT_PUBLIC_APP_URL` | Stripe return URLs, sitemap | Your site's URL, no trailing slash |

Features whose variables are missing fail when used, not at startup. `DATABASE_URL` is the exception: the app won't start without it.

## Database

Migrations are generated from `db/schema.ts` into `drizzle/`.

```bash
npm run db:generate   # after changing db/schema.ts
npm run db:migrate    # apply to the database in .env.local
npm run db:seed       # sample data
```

**Migrations don't run on deploy.** Run `npm run db:migrate` against production *before* deploying code that depends on a new migration. The session callback reads the `users` table on every signed-in request, so a missing column breaks sign-in for everyone.

To make someone an admin (for `/admin`), set `users.is_admin` to `true` in the database.

## Testing locally

```bash
npm test             # Vitest, against an in-process Postgres (PGlite); no setup needed
npm run typecheck
npm run lint
```

CI runs all three on every pull request, and lint warnings fail the build.

### Google sign-in

Add `http://localhost:3000/api/auth/callback/google` as an authorized redirect URI on your Google OAuth client.

### Magic-link email

Resend only accepts senders on a domain verified in your account. Without one:

- Set `AUTH_RESEND_FROM="LeafScore <onboarding@resend.dev>"` to use Resend's sandbox sender, which delivers only to your own Resend account's address.
- Sending to `delivered@resend.dev` succeeds without delivering anything, which is enough to test the "Check your email" page.

Production needs the DNS records in `BACKLOG.md` (PBI 3).

### Stripe

Use test mode keys and the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

Copy the `whsec_...` secret it prints into `STRIPE_WEBHOOK_SECRET` and restart the dev server. Then subscribe from `/settings/billing` with the test card `4242 4242 4242 4242`.

The billing portal behind "Manage Subscription" must be activated once in the [Stripe dashboard](https://dashboard.stripe.com/test/settings/billing/portal).

In production, the webhook endpoint (`/api/stripe/webhook`) must send these events:

- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

### Premium

What Premium unlocks is defined in `lib/premium.ts`. To test it without paying, set `users.is_premium` to `true` in the database and leave `premium_expires_at` empty.

## Project layout

There is no `src/` directory.

| Path | Contents |
|---|---|
| `app/` | Pages, layouts and route handlers |
| `components/` | Shared React components |
| `actions/` | Server actions |
| `lib/data/` | Data access; each function takes the database as its first argument |
| `lib/validation/` | Parsing and validation of user input |
| `db/` | Schema, client, migration and seed scripts, test database |
| `drizzle/` | Generated migrations |

Conventions are in [`CLAUDE.md`](./CLAUDE.md). This version of Next.js has breaking changes from older releases, so check `node_modules/next/dist/docs/` before relying on what you remember.

## Deploying

The site deploys to Vercel. Migrations do not run automatically, so order matters.

### Release steps

1. Set the environment variables in the Vercel project (checklist below).
2. Run `npm run db:migrate` against the production database **before** the new code goes live. The old code keeps serving while the schema changes, so every migration must be safe for the old code too.
3. Merge to `master` (Vercel deploys).
4. First launch only: load catalogue data (see below).

### Expand/contract rule of thumb

- **Expand** first, in one release: add tables, add nullable columns or columns with defaults, add indexes. Old code ignores them.
- **Deploy** code that uses the new shape.
- **Contract** in a later release, once nothing reads the old shape: drop columns or tables, tighten `NOT NULL`, rename (add new, backfill, switch, drop old).
- Never drop or rename something the currently deployed code still reads in the same release as the code change.

### Seeding and importing the catalogue

- `npm run db:seed` loads a small demo set. `db/seed.ts` and `npm run db:import -- --apply` refuse to run against any database host other than localhost, 127.0.0.1, ::1 or `db.localtest.me`. To run them against a hosted database on purpose, set `ALLOW_PROD_SEED=1` (for example `ALLOW_PROD_SEED=1 npm run db:import -- db/data/teas.csv --apply`).
- `npm run db:import -- [file.csv]` validates a CSV (`brand,name,type,subtype,origin,caffeine_level,leaf_style,website`), dedupes by brand and name (case-insensitive, against the database and within the file) and prints a summary. It is a dry run by default; add `--apply` to write. See `db/data/teas.sample.csv`, which is a small starter set that needs human review. The 300-500 tea launch target needs curated or licensed data.

### Environment variable checklist

- [ ] `DATABASE_URL` (Neon, pooled connection string)
- [ ] `AUTH_SECRET`
- [ ] `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`
- [ ] `AUTH_RESEND_KEY`, `AUTH_RESEND_FROM` (verified domain)
- [ ] `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_MONTHLY_PRICE_ID`, `STRIPE_YEARLY_PRICE_ID`
- [ ] `BLOB_READ_WRITE_TOKEN`
- [ ] `CRON_SECRET` (weekly digest; `vercel.json` schedules `/api/cron/digest` Mondays 15:00 UTC)
- [ ] `NEXT_PUBLIC_APP_URL` (no trailing slash)
- [ ] Stripe webhook endpoint configured with the four events listed above

### CI requirements

CI (`.github/workflows/ci.yml`) starts a Postgres 16 service container plus a `local-neon-http-proxy` container (the app's Neon HTTP driver cannot talk to plain Postgres), applies migrations, seeds, then builds with `DATABASE_URL=postgres://postgres:postgres@db.localtest.me:5432/main`. CI also fails when `db/schema.ts` has no matching migration (`drizzle-kit generate` produces new files) and on high-severity production dependency vulnerabilities. Playwright smoke tests are not wired up yet.
