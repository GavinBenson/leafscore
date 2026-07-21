@AGENTS.md

# LeafScore — Community Tea Rating Platform

## Stack
- Next.js 16 (App Router, server components, server actions)
- React 19 with `'use client'` for interactive components
- Tailwind 4 + CSS custom properties (design tokens in `app/globals.css`)
- Drizzle ORM with `pgTable` from `drizzle-orm/pg-core`
- Neon Postgres (serverless) via `@neondatabase/serverless`
- Auth.js v5 (Google + email magic link)
- Stripe for premium subscriptions
- Vercel Blob for image uploads

## Project structure (NO src/ dir — app at root)
- `app/` — pages, layouts, route handlers
- `components/` — shared React components
- `db/` — schema, client, migrate, seed, testDb
- `lib/data/` — data access functions (db as first param)
- `actions/` — server actions (`'use server'`)
- `drizzle/` — generated migrations

## Commands
- `npm run dev` — dev server
- `npm run db:generate` — generate migrations from schema
- `npm run db:migrate` — run migrations (needs .env.local)
- `npm run db:seed` — seed data (needs .env.local)
- `npm test` — vitest

## Conventions
- params is `Promise<{id: string}>` — MUST be awaited in page components
- Data access functions take `Db` type as first arg
- Server actions use FormData, call revalidatePath + redirect
- Mobile-first design — test at 375px width
- Light/dark theme via `data-theme` attribute + CSS custom properties
