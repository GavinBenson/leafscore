import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { MIN_REVIEWS_FOR_SCORE } from '@/lib/scoring'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const DIGEST_WINDOW_DAYS = 7
export const DIGEST_MIN_GAP_DAYS = 6
export const DIGEST_MAX_ITEMS = 5
export const DIGEST_BATCH_SIZE = 100

const DAY_MS = 86_400_000

export type DigestItem = {
  teaId: number
  name: string
  brand: string | null
  type: string
  leafScore: number
  reviewCount: number
  newReviews: number
}

// Teas with a public score that gained visible reviews in the window, best first.
export async function getDigestItems(db: Db, now: Date = new Date(), limit = DIGEST_MAX_ITEMS): Promise<DigestItem[]> {
  const since = new Date(now.getTime() - DIGEST_WINDOW_DAYS * DAY_MS)
  const newReviews = sql<number>`count(${schema.reviews.id})::int`
  const rows = await db
    .select({
      teaId: schema.teas.id,
      name: schema.teas.name,
      brand: schema.brands.name,
      type: schema.teas.type,
      leafScore: schema.teas.leafScore,
      reviewCount: schema.teas.reviewCount,
      newReviews,
    })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(
      and(
        eq(schema.reviews.hidden, false),
        gte(schema.reviews.createdAt, since),
        gte(schema.teas.reviewCount, MIN_REVIEWS_FOR_SCORE),
      ),
    )
    .groupBy(schema.teas.id, schema.brands.name)
    .orderBy(desc(schema.teas.leafScore), desc(newReviews), schema.teas.id)
    .limit(limit)

  return rows.flatMap((r) => (r.leafScore == null ? [] : [{ ...r, leafScore: r.leafScore }]))
}

// Opted-in, not banned, and not emailed within the minimum gap. Oldest-sent first
// so a capped batch rotates through everyone.
export async function listDigestRecipients(db: Db, now: Date = new Date(), limit = DIGEST_BATCH_SIZE) {
  const cutoff = new Date(now.getTime() - DIGEST_MIN_GAP_DAYS * DAY_MS)
  return db
    .select({ id: schema.users.id, email: schema.users.email, name: schema.users.name })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.digestOptIn, true),
        isNull(schema.users.bannedAt),
        or(isNull(schema.users.digestLastSentAt), lt(schema.users.digestLastSentAt, cutoff)),
      ),
    )
    .orderBy(sql`${schema.users.digestLastSentAt} asc nulls first`, schema.users.id)
    .limit(limit)
}

type ClaimedRecipient = { id: number; email: string; name: string; previousSentAt: string | null }

// Atomically takes the next batch: stamps digest_last_sent_at = now for eligible
// users and returns them, so an overlapping run (or a retry of a timed-out cron)
// skips them instead of emailing them again. FOR UPDATE SKIP LOCKED covers two
// claims that start at the same instant. previousSentAt is the exact prior value
// as text, for restoreDigestClaim.
export async function claimDigestRecipients(
  db: Db,
  now: Date = new Date(),
  limit = DIGEST_BATCH_SIZE,
): Promise<ClaimedRecipient[]> {
  const cutoff = new Date(now.getTime() - DIGEST_MIN_GAP_DAYS * DAY_MS).toISOString()
  const stamp = now.toISOString()
  const result: unknown = await db.execute(sql`
    with picked as (
      select id, digest_last_sent_at::text as previous_sent_at
      from ${schema.users}
      where digest_opt_in = true
        and banned_at is null
        and (digest_last_sent_at is null or digest_last_sent_at < ${cutoff}::timestamptz)
      order by digest_last_sent_at asc nulls first, id
      limit ${limit}
      for update skip locked
    )
    update ${schema.users} u
    set digest_last_sent_at = ${stamp}::timestamptz
    from picked
    where u.id = picked.id
    returning u.id, u.email, u.name, picked.previous_sent_at
  `)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    id: number
    email: string
    name: string
    previous_sent_at: string | null
  }[]
  return rows
    .map((r) => ({ id: Number(r.id), email: r.email, name: r.name, previousSentAt: r.previous_sent_at }))
    .sort((a, b) => a.id - b.id)
}

// Undoes a claim after a failed send. Only if the row still carries this run's
// stamp, so a newer successful send is never rolled back.
export async function restoreDigestClaim(db: Db, user: ClaimedRecipient, claimedAt: Date) {
  await db.execute(sql`
    update ${schema.users}
    set digest_last_sent_at = ${user.previousSentAt}::timestamptz
    where id = ${user.id} and digest_last_sent_at = ${claimedAt.toISOString()}::timestamptz
  `)
}

export async function markDigestSent(db: Db, userId: number, at: Date = new Date()) {
  await db.update(schema.users).set({ digestLastSentAt: at }).where(eq(schema.users.id, userId))
}

export async function setDigestOptIn(db: Db, userId: number, optIn: boolean) {
  const rows = await db
    .update(schema.users)
    .set({ digestOptIn: optIn })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id })
  return rows.length > 0
}

export type DigestRunResult = { sent: number; failed: number; skipped: 'no_content' | null }

// Orchestrates one cron invocation. `send` is injected so tests don't touch Resend.
export async function runDigest(
  db: Db,
  send: (to: { id: number; email: string; name: string }, items: DigestItem[]) => Promise<void>,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<DigestRunResult> {
  const now = opts.now ?? new Date()
  const items = await getDigestItems(db, now)
  if (items.length === 0) return { sent: 0, failed: 0, skipped: 'no_content' }

  const recipients = await claimDigestRecipients(db, now, opts.batchSize ?? DIGEST_BATCH_SIZE)
  let sent = 0
  let failed = 0
  for (const user of recipients) {
    try {
      await send(user, items)
    } catch (error) {
      failed++
      console.error(JSON.stringify({ level: 'error', msg: 'digest send failed', userId: user.id, error: String(error) }))
      // Give the user their turn back so the next run retries.
      await restoreDigestClaim(db, user, now).catch((restoreError) =>
        console.error(JSON.stringify({ level: 'error', msg: 'digest claim restore failed', userId: user.id, error: String(restoreError) })),
      )
      continue
    }
    sent++
  }
  return { sent, failed, skipped: null }
}
