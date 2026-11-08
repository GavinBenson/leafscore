import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb } from '@/db/testDb'
import { addReview, addTea, type TestDb } from './testKit'
import {
  getSimilarTeas,
  jaccard,
  rankSimilarTeas,
  type SimilarCandidate,
} from './similarTeas'

const cand = (over: Partial<SimilarCandidate> & { id: number }): SimilarCandidate => ({
  name: `Tea ${over.id}`,
  brandName: null,
  type: 'Oolong',
  subtype: null,
  origin: null,
  leafScore: 80,
  reviewCount: 5,
  sharedTags: 0,
  tagCount: 0,
  ...over,
})

describe('jaccard', () => {
  it('computes overlap over union', () => {
    expect(jaccard(2, 4, 3)).toBeCloseTo(2 / 5)
    expect(jaccard(0, 4, 3)).toBe(0)
    expect(jaccard(0, 0, 0)).toBe(0)
    expect(jaccard(3, 3, 3)).toBe(1)
  })
})

describe('rankSimilarTeas', () => {
  const source = { type: 'Oolong', subtype: 'Tieguanyin', origin: 'Anxi' }

  it('ranks by overlap first, then type, origin, subtype, score, id', () => {
    const ranked = rankSimilarTeas(source, 4, [
      cand({ id: 1, sharedTags: 1, tagCount: 4, type: 'Green' }),
      cand({ id: 2, sharedTags: 3, tagCount: 4, type: 'Green' }),
      cand({ id: 3, sharedTags: 1, tagCount: 4 }),
      cand({ id: 4, sharedTags: 1, tagCount: 4, origin: 'Anxi' }),
      cand({ id: 5, sharedTags: 1, tagCount: 4, origin: 'Anxi', subtype: 'Tieguanyin' }),
      cand({ id: 6, sharedTags: 1, tagCount: 4, origin: 'Anxi', subtype: 'Tieguanyin', leafScore: 90 }),
    ])
    expect(ranked.map((t) => t.id)).toEqual([2, 6, 5, 4, 3, 1])
  })

  it('drops zero-overlap teas of another type but keeps same-type fallbacks', () => {
    const ranked = rankSimilarTeas(source, 0, [
      cand({ id: 1, type: 'Green', leafScore: 99 }),
      cand({ id: 2, leafScore: 70 }),
      cand({ id: 3, leafScore: 95 }),
    ])
    expect(ranked.map((t) => t.id)).toEqual([3, 2])
  })

  it('caps the result and breaks full ties by id', () => {
    const many = Array.from({ length: 10 }, (_, i) => cand({ id: 10 - i }))
    const ranked = rankSimilarTeas(source, 0, many)
    expect(ranked.map((t) => t.id)).toEqual([1, 2, 3, 4, 5, 6])
  })
})

describe('getSimilarTeas', () => {
  let db: TestDb
  let current: number

  async function scoredTea(name: string, tags: string[], values: Partial<schema.NewTea> = {}, n = 3) {
    const tea = await addTea(db, { name, type: 'Oolong', ...values })
    for (let i = 0; i < n; i++) await addReview(db, tea.id, { score: 80, tags: i === 0 ? tags : [] })
    return tea.id
  }

  beforeEach(async () => {
    db = await createTestDb()
    current = await scoredTea('Current', ['floral', 'creamy'], { origin: 'Anxi' })
  })

  it('returns [] for an unknown tea', async () => {
    expect(await getSimilarTeas(db, 99999)).toEqual([])
  })

  it('ranks by tag overlap, excludes itself, and requires a public score', async () => {
    const best = await scoredTea('Best', ['floral', 'creamy'], { type: 'Green' })
    const some = await scoredTea('Some', ['floral', 'smoky'])
    const unscored = await scoredTea('Unscored', ['floral', 'creamy'], {}, 2)
    const result = await getSimilarTeas(db, current)
    const ids = result.map((t) => t.id)
    expect(ids[0]).toBe(best)
    expect(ids).toContain(some)
    expect(ids).not.toContain(current)
    expect(ids).not.toContain(unscored)
    expect(result[0].sharedTags).toBe(2)
    expect(result[0].similarity).toBe(1)
  })

  it('ignores tags from hidden reviews', async () => {
    const tea = await addTea(db, { name: 'Hidden tags', type: 'Green' })
    const r = await addReview(db, tea.id, { tags: ['floral', 'creamy'] })
    await addReview(db, tea.id)
    await addReview(db, tea.id)
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, r.id))
    await addReview(db, tea.id) // keep 3 visible reviews so the tea is scored
    const ids = (await getSimilarTeas(db, current)).map((t) => t.id)
    expect(ids).not.toContain(tea.id)
  })

  it('falls back to same-type top teas when the tea has no tags', async () => {
    const bare = await scoredTea('Bare', [], { type: 'Black' })
    const low = await scoredTea('Low', [], { type: 'Black' })
    await db.update(schema.teas).set({ leafScore: 50 }).where(eq(schema.teas.id, low))
    const top = await scoredTea('Top', [], { type: 'Black' })
    await db.update(schema.teas).set({ leafScore: 95 }).where(eq(schema.teas.id, top))
    await scoredTea('Other type', ['x'], { type: 'Green' })
    const result = await getSimilarTeas(db, bare)
    expect(result.map((t) => t.id)).toEqual([top, low])
  })

  it('returns at most 6', async () => {
    for (let i = 0; i < 9; i++) await scoredTea(`T${i}`, ['floral'])
    expect((await getSimilarTeas(db, current)).length).toBe(6)
  })
})
