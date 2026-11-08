import { beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '@/db/testDb'
import * as schema from '@/db/schema'
import { hitRateLimit, purgeExpiredRateLimits } from './rateLimit'

describe('hitRateLimit', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  beforeEach(async () => {
    db = await createTestDb()
  })

  it('allows up to the limit, then blocks with a retry time', async () => {
    const results = []
    for (let i = 0; i < 4; i++) results.push(await hitRateLimit(db, 'k', 3, 60))

    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0])
    expect(results[0].retryAfterSeconds).toBe(0)
    expect(results[3].retryAfterSeconds).toBeGreaterThan(0)
    expect(results[3].retryAfterSeconds).toBeLessThanOrEqual(60)
  })

  it('keeps keys independent', async () => {
    await hitRateLimit(db, 'a', 1, 60)
    expect((await hitRateLimit(db, 'a', 1, 60)).allowed).toBe(false)
    expect((await hitRateLimit(db, 'b', 1, 60)).allowed).toBe(true)
  })

  it('starts a fresh window once the old one has expired', async () => {
    await hitRateLimit(db, 'k', 1, 60)
    expect((await hitRateLimit(db, 'k', 1, 60)).allowed).toBe(false)
    await db.update(schema.rateLimits).set({ windowStart: sql`now() - interval '2 minutes'` })

    const result = await hitRateLimit(db, 'k', 1, 60)
    expect(result).toMatchObject({ allowed: true, remaining: 0 })
  })

  it('does not overshoot under concurrency', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => hitRateLimit(db, 'k', 4, 60)))
    expect(results.filter((r) => r.allowed)).toHaveLength(4)
  })

  it('purges old windows', async () => {
    await hitRateLimit(db, 'old', 1, 60)
    await db.update(schema.rateLimits).set({ windowStart: sql`now() - interval '3 days'` })
    await hitRateLimit(db, 'new', 1, 60)
    await purgeExpiredRateLimits(db)
    expect((await db.select().from(schema.rateLimits)).map((r) => r.key)).toEqual(['new'])
  })
})
