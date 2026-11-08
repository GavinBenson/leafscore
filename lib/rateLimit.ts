import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type RateLimitResult = { allowed: boolean; remaining: number; retryAfterSeconds: number }

// Fixed-window counter in one atomic upsert: a new key starts a window; an
// expired window resets to 1; otherwise the count is incremented. Concurrent
// callers serialize on the row, so the limit can't be overshot. Denied hits
// still increment, which is harmless (the window length is fixed).
export async function hitRateLimit(
  db: Db,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const result: unknown = await db.execute(sql`
    insert into ${schema.rateLimits} as r (key, window_start, count)
    values (${key}, now(), 1)
    on conflict (key) do update set
      window_start = case
        when r.window_start <= now() - make_interval(secs => ${windowSeconds}) then now()
        else r.window_start
      end,
      count = case
        when r.window_start <= now() - make_interval(secs => ${windowSeconds}) then 1
        else r.count + 1
      end
    returning
      count,
      ceil(extract(epoch from (window_start + make_interval(secs => ${windowSeconds}) - now())))::int as retry_after
  `)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as { count: number; retry_after: number }[]
  const row = rows[0]
  const count = Number(row.count)
  const allowed = count <= limit
  return {
    allowed,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: allowed ? 0 : Math.max(1, Number(row.retry_after)),
  }
}

// Housekeeping for a cron or occasional call: drops windows that ended long ago.
export async function purgeExpiredRateLimits(db: Db, olderThanSeconds = 86_400): Promise<number> {
  const result: unknown = await db.execute(sql`
    delete from ${schema.rateLimits}
    where window_start < now() - make_interval(secs => ${olderThanSeconds})
    returning key
  `)
  const rows = Array.isArray(result) ? result : (result as { rows: unknown[] }).rows
  return rows.length
}
