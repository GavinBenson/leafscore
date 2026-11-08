import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { getDigestItems, listDigestRecipients, runDigest } from './digest'
import { createAffiliateLink, recordAffiliateClick } from './affiliate'

let db: Awaited<ReturnType<typeof createTestDb>>
const now = new Date('2026-06-10T12:00:00Z')
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000)

// Three reviewers so the tea reaches a public score.
async function scoredTea(name: string, score: number, createdAt: Date, hidden = false) {
  const tea = await seedTestTea(db, { name, leafScore: score, reviewCount: 3 })
  for (let i = 0; i < 3; i++) {
    const u = await seedTestUser(db, `${name}-${i}@example.com`)
    await db.insert(schema.reviews).values({ userId: u.id, teaId: tea.id, score, createdAt, hidden })
  }
  return tea
}

beforeEach(async () => {
  db = await createTestDb()
})

describe('getDigestItems', () => {
  it('ranks by score, needs a public score and recent visible reviews', async () => {
    const hi = await scoredTea('Hi', 90, daysAgo(1))
    const lo = await scoredTea('Lo', 70, daysAgo(2))
    await scoredTea('Old', 99, daysAgo(20))
    await scoredTea('Hidden', 98, daysAgo(1), true)
    await seedTestTea(db, { name: 'Unscored', leafScore: 100, reviewCount: 2 })
    const items = await getDigestItems(db, now)
    expect(items.map((i) => i.teaId)).toEqual([hi.id, lo.id])
    expect(items[0].newReviews).toBe(3)
  })
  it('caps at 5', async () => {
    for (let i = 0; i < 7; i++) await scoredTea(`T${i}`, 50 + i, daysAgo(1))
    expect(await getDigestItems(db, now)).toHaveLength(5)
  })
})

describe('recipients and run', () => {
  it('respects opt-in, bans and the 6 day gap; marks sent only on success', async () => {
    await scoredTea('Hi', 90, daysAgo(1))
    const mk = async (email: string, v: Partial<schema.NewUser>) => {
      const u = await seedTestUser(db, email)
      await db.update(schema.users).set({ digestOptIn: false, ...v }).where(eq(schema.users.id, u.id))
      return u
    }
    const optedIn = await mk('in@example.com', { digestOptIn: true })
    await mk('out@example.com', {})
    await mk('banned@example.com', { digestOptIn: true, bannedAt: daysAgo(1) })
    await mk('recent@example.com', { digestOptIn: true, digestLastSentAt: daysAgo(3) })
    const old = await mk('old@example.com', { digestOptIn: true, digestLastSentAt: daysAgo(8) })
    const failing = await mk('fail@example.com', { digestOptIn: true })

    expect((await listDigestRecipients(db, now)).map((u) => u.email).sort()).toEqual([
      'fail@example.com',
      'in@example.com',
      'old@example.com',
    ])

    const sentTo: string[] = []
    const res = await runDigest(
      db,
      async (u) => {
        if (u.id === failing.id) throw new Error('boom')
        sentTo.push(u.email)
      },
      { now },
    )
    expect(res).toEqual({ sent: 2, failed: 1, skipped: null })
    expect(sentTo.sort()).toEqual(['in@example.com', 'old@example.com'])
    const row = async (id: number) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]
    expect((await row(optedIn.id)).digestLastSentAt).not.toBeNull()
    expect((await row(old.id)).digestLastSentAt?.getTime()).toBe(now.getTime())
    expect((await row(failing.id)).digestLastSentAt).toBeNull()
  })
  it('two overlapping runs email each user once', async () => {
    await scoredTea('Hi', 90, daysAgo(1))
    for (const e of ['a', 'b', 'c']) {
      const x = await seedTestUser(db, `${e}@example.com`)
      await db.update(schema.users).set({ digestOptIn: true }).where(eq(schema.users.id, x.id))
    }
    const sentTo: string[] = []
    const send = async (u: { email: string }) => {
      await new Promise((r) => setTimeout(r, 5))
      sentTo.push(u.email)
    }
    const [r1, r2] = await Promise.all([runDigest(db, send, { now }), runDigest(db, send, { now })])
    expect(r1.sent + r2.sent).toBe(3)
    expect(sentTo.sort()).toEqual(['a@example.com', 'b@example.com', 'c@example.com'])
  })

  it('restores the previous timestamp when a send fails, and rotates through batches', async () => {
    await scoredTea('Hi', 90, daysAgo(1))
    const mk = async (email: string, last: Date | null) => {
      const u = await seedTestUser(db, email)
      await db.update(schema.users).set({ digestOptIn: true, digestLastSentAt: last }).where(eq(schema.users.id, u.id))
      return u
    }
    const stale = await mk('stale@example.com', daysAgo(9))
    const fresh = await mk('fresh@example.com', null)
    await runDigest(db, async () => { throw new Error('boom') }, { now, batchSize: 1 })
    const row = async (id: number) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]
    expect((await row(fresh.id)).digestLastSentAt).toBeNull()
    expect((await row(stale.id)).digestLastSentAt?.getTime()).toBe(daysAgo(9).getTime())

    // A successful run of 1 sends the never-emailed user first, then the stale one next run.
    const sentTo: string[] = []
    await runDigest(db, async (u) => void sentTo.push(u.email), { now, batchSize: 1 })
    await runDigest(db, async (u) => void sentTo.push(u.email), { now, batchSize: 1 })
    expect(sentTo).toEqual(['fresh@example.com', 'stale@example.com'])
  })

  it('sends nothing when there is no content, and honors the batch cap', async () => {
    const u = await seedTestUser(db, 'a@example.com')
    await db.update(schema.users).set({ digestOptIn: true }).where(eq(schema.users.id, u.id))
    let calls = 0
    expect(await runDigest(db, async () => void calls++, { now })).toMatchObject({ skipped: 'no_content' })
    expect(calls).toBe(0)

    await scoredTea('Hi', 90, daysAgo(1))
    for (const e of ['b', 'c']) {
      const x = await seedTestUser(db, `${e}@example.com`)
      await db.update(schema.users).set({ digestOptIn: true }).where(eq(schema.users.id, x.id))
    }
    expect((await runDigest(db, async () => void calls++, { now, batchSize: 2 })).sent).toBe(2)
  })
})

describe('recordAffiliateClick', () => {
  it('increments atomically and returns https urls only', async () => {
    const tea = await seedTestTea(db)
    const good = await createAffiliateLink(db, tea.id, {
      provider: 'S',
      url: 'https://s.example/x',
      priceCents: null,
      currency: null,
      pricePer100gCents: null,
    })
    const [bad] = await db
      .insert(schema.affiliateLinks)
      .values({ teaId: tea.id, provider: 'B', url: 'javascript:alert(1)' })
      .returning()
    await Promise.all([recordAffiliateClick(db, good.id), recordAffiliateClick(db, good.id)])
    const [row] = await db.select().from(schema.affiliateLinks).where(eq(schema.affiliateLinks.id, good.id))
    expect(row.clickCount).toBe(2)
    expect(await recordAffiliateClick(db, bad.id)).toBeNull()
    expect(await recordAffiliateClick(db, 99999)).toBeNull()
  })
})
