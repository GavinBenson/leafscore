import { and, asc, eq, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { REPORT_REASONS, type ReportReason } from '@/db/schema'
import { lockTea } from './reviews'
import { recalcLeafScore } from './teas'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const MAX_REPORT_DETAILS_LENGTH = 500
export { REPORT_REASONS }
export type { ReportReason }

export type CreateReportResult =
  | { ok: true; report: schema.Report }
  | {
      ok: false
      reason:
        | 'invalid_reason'
        | 'details_too_long'
        | 'review_not_found'
        | 'own_review'
        | 'list_not_found'
        | 'own_list'
        | 'already_reported'
    }

// Reports a review (reviewId) or a list (listId). Exactly one target. Hidden or
// private lists cannot be reported by strangers (they are not found).
export async function createReport(
  db: Db,
  data: { reporterUserId: number; reason: string; details?: string | null } & (
    | { reviewId: number; listId?: undefined }
    | { listId: number; reviewId?: undefined }
  ),
): Promise<CreateReportResult> {
  if (!(REPORT_REASONS as readonly string[]).includes(data.reason)) {
    return { ok: false, reason: 'invalid_reason' }
  }
  const details = data.details?.trim() || null
  if (details && details.length > MAX_REPORT_DETAILS_LENGTH) {
    return { ok: false, reason: 'details_too_long' }
  }

  if (data.listId !== undefined) {
    const [list] = await db
      .select({ userId: schema.lists.userId, isPublic: schema.lists.isPublic, hidden: schema.lists.hidden })
      .from(schema.lists)
      .where(eq(schema.lists.id, data.listId))
    if (!list || !list.isPublic || list.hidden) return { ok: false, reason: 'list_not_found' }
    if (list.userId === data.reporterUserId) return { ok: false, reason: 'own_list' }
  } else {
    const [review] = await db
      .select({ userId: schema.reviews.userId })
      .from(schema.reviews)
      .where(eq(schema.reviews.id, data.reviewId))
    if (!review) return { ok: false, reason: 'review_not_found' }
    if (review.userId === data.reporterUserId) return { ok: false, reason: 'own_review' }
  }

  const [report] = await db
    .insert(schema.reports)
    .values({
      reviewId: data.reviewId ?? null,
      listId: data.listId ?? null,
      reporterUserId: data.reporterUserId,
      reason: data.reason as ReportReason,
      details,
    })
    .onConflictDoNothing()
    .returning()
  if (!report) return { ok: false, reason: 'already_reported' }
  return { ok: true, report }
}

// Review reports only (see listPendingListReports for lists). One row per pending report, joined with its review, tea, author and reporter,
// plus how many pending reports the same review has. Oldest first.
export async function listPendingReports(db: Db) {
  const author = alias(schema.users, 'author')
  const reporter = alias(schema.users, 'reporter')

  return db
    .select({
      report: schema.reports,
      review: schema.reviews,
      tea: { id: schema.teas.id, name: schema.teas.name },
      author: { id: author.id, name: author.name, bannedAt: author.bannedAt },
      reporter: { id: reporter.id, name: reporter.name },
      reportCount: sql<number>`(
        select count(*)::int from ${schema.reports} r2
        where r2.review_id = ${schema.reports.reviewId} and r2.status = 'pending'
      )`,
    })
    .from(schema.reports)
    .innerJoin(schema.reviews, eq(schema.reports.reviewId, schema.reviews.id))
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .innerJoin(author, eq(schema.reviews.userId, author.id))
    .innerJoin(reporter, eq(schema.reports.reporterUserId, reporter.id))
    .where(eq(schema.reports.status, 'pending'))
    .orderBy(asc(schema.reports.createdAt), asc(schema.reports.id))
}

// Pending reports on lists: the list, its owner and reporter, and how many
// pending reports the same list has. Oldest first.
export async function listPendingListReports(db: Db) {
  const owner = alias(schema.users, 'owner')
  const reporter = alias(schema.users, 'reporter')

  return db
    .select({
      report: schema.reports,
      list: schema.lists,
      owner: { id: owner.id, name: owner.name, bannedAt: owner.bannedAt },
      reporter: { id: reporter.id, name: reporter.name },
      reportCount: sql<number>`(
        select count(*)::int from ${schema.reports} r2
        where r2.list_id = ${schema.reports.listId} and r2.status = 'pending'
      )`,
    })
    .from(schema.reports)
    .innerJoin(schema.lists, eq(schema.reports.listId, schema.lists.id))
    .innerJoin(owner, eq(schema.lists.userId, owner.id))
    .innerJoin(reporter, eq(schema.reports.reporterUserId, reporter.id))
    .where(eq(schema.reports.status, 'pending'))
    .orderBy(asc(schema.reports.createdAt), asc(schema.reports.id))
}

export type ReportResolution = 'dismiss' | 'hide' | 'hide_and_ban' | 'hide_list' | 'hide_list_and_ban'

export type ResolveReportResult =
  | {
      reviewId: number
      listId: null
      teaId?: number
      authorId?: number
      hidden: boolean
      banned: boolean
    }
  | { reviewId: null; listId: number; teaId?: undefined; authorId?: number; hidden: boolean; banned: boolean }
  | { blocked: 'author_is_admin' }

// Resolves the report. Review reports take dismiss | hide | hide_and_ban; list
// reports take dismiss | hide_list | hide_list_and_ban. Hiding closes every
// pending report on the same review or list as actioned; for a review it also
// recomputes the tea's score and clears its helpful votes; ban options ban the
// author. Returns null when the report is missing, already resolved, or the
// resolution does not fit the report's target (nothing changes), or
// { blocked: 'author_is_admin' } (nothing changed) when asked to ban an admin.
export async function resolveReport(
  db: Db,
  reportId: number,
  resolution: ReportResolution,
  adminUserId: number,
): Promise<ResolveReportResult | null> {
  return db.transaction(async (tx): Promise<ResolveReportResult | null> => {
    const [report] = await tx
      .select()
      .from(schema.reports)
      .where(and(eq(schema.reports.id, reportId), eq(schema.reports.status, 'pending')))
    if (!report) return null

    const now = new Date()
    if (resolution === 'dismiss') {
      await tx
        .update(schema.reports)
        .set({ status: 'dismissed', resolvedAt: now, resolvedBy: adminUserId })
        .where(eq(schema.reports.id, reportId))
      return report.listId !== null
        ? { reviewId: null, listId: report.listId, hidden: false, banned: false }
        : { reviewId: report.reviewId as number, listId: null, hidden: false, banned: false }
    }

    const ban = resolution === 'hide_and_ban' || resolution === 'hide_list_and_ban'

    if (report.listId !== null) {
      if (resolution !== 'hide_list' && resolution !== 'hide_list_and_ban') return null
      const [list] = await tx
        .select({ userId: schema.lists.userId })
        .from(schema.lists)
        .where(eq(schema.lists.id, report.listId))
      if (!list) return null

      if (ban) {
        const [author] = await tx
          .select({ isAdmin: schema.users.isAdmin })
          .from(schema.users)
          .where(eq(schema.users.id, list.userId))
        if (author?.isAdmin) return { blocked: 'author_is_admin' as const }
      }

      await tx.update(schema.lists).set({ hidden: true }).where(eq(schema.lists.id, report.listId))
      await tx
        .update(schema.reports)
        .set({ status: 'actioned', resolvedAt: now, resolvedBy: adminUserId })
        .where(and(eq(schema.reports.listId, report.listId), eq(schema.reports.status, 'pending')))
      if (ban) {
        await tx.update(schema.users).set({ bannedAt: now }).where(eq(schema.users.id, list.userId))
      }
      return { reviewId: null, listId: report.listId, authorId: list.userId, hidden: true, banned: ban }
    }

    if (resolution !== 'hide' && resolution !== 'hide_and_ban') return null
    const reviewId = report.reviewId as number
    const [review] = await tx
      .select({ teaId: schema.reviews.teaId, userId: schema.reviews.userId })
      .from(schema.reviews)
      .where(eq(schema.reviews.id, reviewId))
    if (!review) return null

    if (ban) {
      const [author] = await tx
        .select({ isAdmin: schema.users.isAdmin })
        .from(schema.users)
        .where(eq(schema.users.id, review.userId))
      if (author?.isAdmin) return { blocked: 'author_is_admin' as const }
    }

    await lockTea(tx, review.teaId)
    await tx.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, reviewId))
    await tx.delete(schema.reviewHelpfulVotes).where(eq(schema.reviewHelpfulVotes.reviewId, reviewId))
    await recalcLeafScore(tx, review.teaId)
    await tx
      .update(schema.reports)
      .set({ status: 'actioned', resolvedAt: now, resolvedBy: adminUserId })
      .where(and(eq(schema.reports.reviewId, reviewId), eq(schema.reports.status, 'pending')))

    if (ban) {
      await tx.update(schema.users).set({ bannedAt: now }).where(eq(schema.users.id, review.userId))
    }
    return {
      reviewId,
      listId: null,
      teaId: review.teaId,
      authorId: review.userId,
      hidden: true,
      banned: ban,
    }
  })
}
