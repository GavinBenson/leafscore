import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { createReview, updateReview } from './reviews'
import { getTea, recalcLeafScore } from './teas'
import { addTeaToList, createList } from './lists'
import { upsertCellarItem } from './cellar'
import { createSession } from './brewSessions'
import { toggleHelpful } from './helpful'
import { countTeaDependents, deleteTea } from './teaAdmin'
import { deleteUserAccount, exportUserData, getUserById, updateUserPreferences } from './users'
import { parseReviewForm } from '@/lib/validation/review'

describe('user preferences', () => {
  it('defaults, updates partially and refuses bad values', async () => {
    const db = await createTestDb()
    const user = await seedTestUser(db)
    expect(await getUserById(db, user.id)).toMatchObject({ tempUnit: 'c', weightUnit: 'g', blindTasting: false })

    expect(await updateUserPreferences(db, user.id, { tempUnit: 'f' })).toEqual({
      ok: true,
      preferences: { tempUnit: 'f', weightUnit: 'g', blindTasting: false },
    })
    expect(await updateUserPreferences(db, user.id, { weightUnit: 'oz', blindTasting: true })).toEqual({
      ok: true,
      preferences: { tempUnit: 'f', weightUnit: 'oz', blindTasting: true },
    })
    expect(await updateUserPreferences(db, user.id, {})).toMatchObject({ ok: true })
    expect(await updateUserPreferences(db, user.id, { tempUnit: 'k' })).toMatchObject({ ok: false })
    expect(await updateUserPreferences(db, user.id, { weightUnit: 'lb' })).toMatchObject({ ok: false })
    expect(await updateUserPreferences(db, user.id, { blindTasting: 'yes' })).toMatchObject({ ok: false })
    expect(await updateUserPreferences(db, 9999, { tempUnit: 'c' })).toMatchObject({ ok: false })
    expect(await getUserById(db, user.id)).toMatchObject({ tempUnit: 'f', weightUnit: 'oz', blindTasting: true })
  })

  it('the database refuses unknown units', async () => {
    const db = await createTestDb()
    const user = await seedTestUser(db)
    await expect(
      db.update(schema.users).set({ tempUnit: 'k' as never }).where(eq(schema.users.id, user.id)),
    ).rejects.toThrow()
    await expect(
      db.update(schema.users).set({ weightUnit: 'lb' as never }).where(eq(schema.users.id, user.id)),
    ).rejects.toThrow()
  })
})

describe('rubric sub-scores', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    teaId = (await seedTestTea(db)).id
  })

  it('persists sub-scores through create and update, and returns them', async () => {
    const userId = (await seedTestUser(db)).id
    const review = await createReview(db, { userId, teaId, score: 80, aromaScore: 90, valueScore: 0 })
    expect(review).toMatchObject({ aromaScore: 90, valueScore: 0, flavorScore: null })

    const updated = await updateReview(
      db,
      review.id,
      userId,
      { score: 80, brewMethod: null, brewTemp: null, steepTime: null, notes: null, wouldDrinkAgain: null, photoUrl: null, bodyScore: 55 },
      [],
    )
    expect(updated).toMatchObject({ bodyScore: 55, aromaScore: 90 }) // untouched fields stay
    const explicit = await updateReview(
      db,
      review.id,
      userId,
      { score: 80, brewMethod: null, brewTemp: null, steepTime: null, notes: null, wouldDrinkAgain: null, photoUrl: null, aromaScore: null },
      [],
    )
    expect(explicit?.aromaScore).toBeNull()
  })

  it('never changes the LeafScore', async () => {
    const users = [
      await seedTestUser(db, 'a@example.com'),
      await seedTestUser(db, 'b@example.com'),
      await seedTestUser(db, 'c@example.com'),
    ]
    await createReview(db, { userId: users[0].id, teaId, score: 90, aromaScore: 10, flavorScore: 10, bodyScore: 10, aftertasteScore: 10, valueScore: 10 })
    await createReview(db, { userId: users[1].id, teaId, score: 60 })
    const last = await createReview(db, { userId: users[2].id, teaId, score: 30, aromaScore: 100 })

    expect((await getTea(db, teaId))!.tea).toMatchObject({ leafScore: 60, reviewCount: 3 })

    await db.update(schema.reviews).set({ aromaScore: 0, flavorScore: 0, bodyScore: 100, aftertasteScore: 1, valueScore: 99 })
    await recalcLeafScore(db, teaId)
    expect((await getTea(db, teaId))!.tea).toMatchObject({ leafScore: 60, reviewCount: 3 })

    await updateReview(
      db, last.id, users[2].id,
      { score: 30, brewMethod: null, brewTemp: null, steepTime: null, notes: null, wouldDrinkAgain: null, photoUrl: null, valueScore: 77 },
      [],
    )
    expect((await getTea(db, teaId))!.tea.leafScore).toBe(60)
  })

  it('the database refuses out-of-range sub-scores', async () => {
    const userId = (await seedTestUser(db)).id
    for (const field of ['aromaScore', 'flavorScore', 'bodyScore', 'aftertasteScore', 'valueScore'] as const) {
      await expect(db.insert(schema.reviews).values({ userId, teaId, score: 50, [field]: 101 })).rejects.toThrow()
      await expect(db.insert(schema.reviews).values({ userId, teaId, score: 50, [field]: -1 })).rejects.toThrow()
    }
  })

  it('the form parser output creates a review', async () => {
    const userId = (await seedTestUser(db)).id
    const fd = new FormData()
    fd.set('teaId', String(teaId))
    fd.set('score', '70')
    fd.set('aromaScore', '88')
    const parsed = parseReviewForm(fd)
    if (!parsed.ok) throw new Error('invalid')
    const { tagIds, ...data } = parsed.data
    const review = await createReview(db, { ...data, userId }, tagIds)
    expect(review.aromaScore).toBe(88)
  })
})

describe('export, deletion and tea dependents across the new tables', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let userId: number
  let otherId: number
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    userId = (await seedTestUser(db)).id
    otherId = (await seedTestUser(db, 'other@example.com')).id
    teaId = (await seedTestTea(db)).id
  })

  const fill = async () => {
    const list = await createList(db, { userId, title: 'Mine', description: 'd', isPublic: true }, false)
    if (!list.ok) throw new Error('list')
    await addTeaToList(db, list.list.id, userId, teaId)
    await upsertCellarItem(db, userId, teaId, { grams: 50, lowStockGrams: 10, notes: 'n' })
    await createSession(db, userId, { teaId, method: 'gongfu', infusions: [{ seconds: 10, rating: 70 }, { seconds: 15 }] }, false)
    const theirs = await createReview(db, { userId: otherId, teaId, score: 50 })
    await toggleHelpful(db, userId, theirs.id)
    await createReview(db, { userId, teaId, score: 90, aromaScore: 80 })
    return list.list
  }

  it('exports preferences, lists, cellar, sessions and votes as plain JSON', async () => {
    await updateUserPreferences(db, userId, { tempUnit: 'f', blindTasting: true })
    await fill()
    const data = await exportUserData(db, userId)
    expect(JSON.parse(JSON.stringify(data))).toEqual(data)
    expect(data?.preferences).toEqual({ tempUnit: 'f', weightUnit: 'g', blindTasting: true })
    expect(data?.lists).toHaveLength(1)
    expect(data?.lists[0]).toMatchObject({ title: 'Mine', isPublic: true })
    expect(data?.lists[0].teas.map((t) => t.tea)).toEqual(['Test Tea'])
    expect(data?.cellar[0]).toMatchObject({ tea: 'Test Tea', grams: 50, lowStockGrams: 10, notes: 'n' })
    expect(data?.sessions[0]).toMatchObject({ method: 'gongfu' })
    expect(data?.sessions[0].infusions.map((i) => [i.step, i.seconds, i.rating])).toEqual([[1, 10, 70], [2, 15, null]])
    expect(data?.helpfulVotes).toHaveLength(1)
    expect(data?.reviews[0]).toMatchObject({ aromaScore: 80, flavorScore: null })
    // Nothing from other users leaks in.
    const theirs = await exportUserData(db, otherId)
    expect(theirs?.lists).toEqual([])
    expect(theirs?.cellar).toEqual([])
    expect(theirs?.sessions).toEqual([])
    expect(theirs?.helpfulVotes).toEqual([])
  })

  it('deleting the account removes every new table row and returns no extra blobs', async () => {
    await fill()
    const list = (await db.select().from(schema.lists))[0]
    const reporter = await db.insert(schema.reports).values({ listId: list.id, reporterUserId: otherId, reason: 'spam' }).returning()
    expect(reporter).toHaveLength(1)

    const result = await deleteUserAccount(db, userId)
    expect(Object.keys(result ?? {}).sort()).toEqual(['photoUrls', 'stripeCustomerId'])
    for (const table of [
      schema.lists,
      schema.listItems,
      schema.cellarItems,
      schema.brewSessions,
      schema.brewInfusions,
      schema.reviewHelpfulVotes,
      schema.reports,
    ]) {
      expect(await db.$count(table)).toBe(0)
    }
    // The other user's review remains.
    expect(await db.$count(schema.reviews)).toBe(1)
  })

  it('counts the new dependents so deleteTea stays accurate', async () => {
    const tea2 = (await seedTestTea(db, { name: 'Two' })).id
    const list = await createList(db, { userId, title: 'L' }, false)
    if (!list.ok) throw new Error('list')
    await addTeaToList(db, list.list.id, userId, tea2)
    await upsertCellarItem(db, userId, tea2, { grams: 5 })
    await createSession(db, userId, { teaId: tea2, infusions: [{ seconds: 5 }] }, false)

    expect(await countTeaDependents(db, tea2)).toEqual({
      reviews: 0,
      favorites: 0,
      wishlist: 0,
      listItems: 1,
      cellarItems: 1,
      sessions: 1,
    })
    expect(await deleteTea(db, tea2)).toEqual({ ok: true })
    expect(await db.$count(schema.listItems)).toBe(0)
    expect(await db.$count(schema.cellarItems)).toBe(0)
    expect(await db.$count(schema.brewSessions)).toBe(0)
  })
})
