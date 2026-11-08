import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea, seedTestUser } from '@/db/testDb'
import * as schema from '@/db/schema'
import { createReview, listReviewsForTea } from './reviews'
import { createReport, listPendingReports, resolveReport } from './reports'
import { getTea } from './teas'
import { getUserById } from './users'

describe('reports', () => {
  let db: Awaited<ReturnType<typeof createTestDb>>
  let author: number
  let reporterA: number
  let reporterB: number
  let admin: number
  let teaId: number
  let reviewId: number

  beforeEach(async () => {
    db = await createTestDb()
    author = (await seedTestUser(db, 'author@example.com')).id
    reporterA = (await seedTestUser(db, 'a@example.com')).id
    reporterB = (await seedTestUser(db, 'b@example.com')).id
    admin = (await seedTestUser(db, 'admin@example.com')).id
    teaId = (await seedTestTea(db)).id
    reviewId = (await createReview(db, { userId: author, teaId, score: 90, notes: 'bad words' })).id
  })

  it('creates a report and rejects duplicates, bad input and self-reports', async () => {
    const ok = await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'spam', details: '  x  ' })
    expect(ok.ok && ok.report.details).toBe('x')

    expect(await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'spam' })).toEqual({
      ok: false,
      reason: 'already_reported',
    })
    expect(await createReport(db, { reviewId, reporterUserId: reporterB, reason: 'nope' })).toEqual({
      ok: false,
      reason: 'invalid_reason',
    })
    expect(
      await createReport(db, { reviewId, reporterUserId: reporterB, reason: 'other', details: 'x'.repeat(501) }),
    ).toEqual({ ok: false, reason: 'details_too_long' })
    expect(await createReport(db, { reviewId, reporterUserId: author, reason: 'spam' })).toEqual({
      ok: false,
      reason: 'own_review',
    })
    expect(await createReport(db, { reviewId: 9999, reporterUserId: reporterB, reason: 'spam' })).toEqual({
      ok: false,
      reason: 'review_not_found',
    })
  })

  it('lists pending reports with review, tea, author, reporter and report count', async () => {
    await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'spam' })
    await createReport(db, { reviewId, reporterUserId: reporterB, reason: 'offensive' })

    const rows = await listPendingReports(db)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      review: { id: reviewId, notes: 'bad words' },
      tea: { id: teaId },
      author: { id: author },
      reportCount: 2,
    })
    expect(rows.map((r) => r.reporter.id).sort()).toEqual([reporterA, reporterB].sort())
  })

  it('dismiss closes the report and leaves the review visible', async () => {
    const { report } = (await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'spam' })) as {
      report: schema.Report
    }
    expect(await resolveReport(db, report.id, 'dismiss', admin)).toMatchObject({ hidden: false })

    expect(await listPendingReports(db)).toHaveLength(0)
    expect(await listReviewsForTea(db, teaId)).toHaveLength(1)
    expect(await resolveReport(db, report.id, 'dismiss', admin)).toBeNull()
  })

  it('hide removes the review from the tea and its average, and closes every report on it', async () => {
    const other = (await seedTestUser(db, 'o@example.com')).id
    await createReview(db, { userId: other, teaId, score: 50 })
    const { report } = (await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'spam' })) as {
      report: schema.Report
    }
    await createReport(db, { reviewId, reporterUserId: reporterB, reason: 'spam' })

    expect(await resolveReport(db, report.id, 'hide', admin)).toMatchObject({ hidden: true, banned: false })

    expect(await listReviewsForTea(db, teaId)).toHaveLength(1)
    expect((await getTea(db, teaId))!.tea).toMatchObject({ leafScore: 50, reviewCount: 1 })
    expect(await listPendingReports(db)).toHaveLength(0)
    const stored = await db.select().from(schema.reports)
    expect(stored.every((r) => r.status === 'actioned' && r.resolvedBy === admin)).toBe(true)
    expect((await getUserById(db, author))?.bannedAt).toBeNull()
  })

  it('hide_and_ban also bans the author', async () => {
    const { report } = (await createReport(db, { reviewId, reporterUserId: reporterA, reason: 'fake' })) as {
      report: schema.Report
    }
    await resolveReport(db, report.id, 'hide_and_ban', admin)

    expect((await getUserById(db, author))?.bannedAt).toBeInstanceOf(Date)
    const [row] = await db.select().from(schema.reviews).where(eq(schema.reviews.id, reviewId))
    expect(row.hidden).toBe(true)
  })
})
