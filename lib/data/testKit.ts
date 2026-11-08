// Test-only helpers for the read-model tests (brew guide, similar teas, compare,
// taste profile). Never imported by app code.
import * as schema from '@/db/schema'
import { createTestDb, seedTestTea } from '@/db/testDb'
import { recalcLeafScore } from '@/lib/data/teas'

export type TestDb = Awaited<ReturnType<typeof createTestDb>>

let counter = 0

export async function addUser(db: TestDb, values: Partial<schema.NewUser> = {}) {
  counter += 1
  const [user] = await db
    .insert(schema.users)
    .values({ name: `User ${counter}`, email: `kit-${counter}-${Date.now()}@example.com`, ...values })
    .returning()
  return user
}

export async function addTag(db: TestDb, name: string) {
  const [tag] = await db
    .insert(schema.flavorTags)
    .values({ name, category: 'test' })
    .onConflictDoNothing()
    .returning()
  if (tag) return tag
  const rows = await db.select().from(schema.flavorTags)
  return rows.find((t) => t.name === name)!
}

/** Insert a review from a brand-new user (or the given user) and recalc the tea. */
export async function addReview(
  db: TestDb,
  teaId: number,
  values: Partial<schema.NewReview> & { tags?: string[] } = {},
) {
  const { tags = [], userId, ...rest } = values
  const uid = userId ?? (await addUser(db)).id
  const [review] = await db
    .insert(schema.reviews)
    .values({ userId: uid, teaId, score: 80, ...rest })
    .returning()
  for (const name of tags) {
    const tag = await addTag(db, name)
    await db.insert(schema.reviewTags).values({ reviewId: review.id, flavorTagId: tag.id })
  }
  await recalcLeafScore(db, teaId)
  return review
}

export async function addTea(db: TestDb, values: Partial<schema.NewTea> = {}) {
  return seedTestTea(db, values)
}
