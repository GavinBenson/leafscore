import { sql } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export type AdminStats = {
  totalTeas: number
  totalReviews: number
  totalUsers: number
  signupsLast7Days: number
  reviewsLast7Days: number
  premiumUsers: number
  pendingTeaRequests: number
  pendingReports: number
}

// One round trip: every figure is a scalar subquery in a single SELECT.
export async function getAdminStats(db: Db): Promise<AdminStats> {
  const result: unknown = await db.execute(sql`
    select
      (select count(*) from ${schema.teas}) as total_teas,
      (select count(*) from ${schema.reviews}) as total_reviews,
      (select count(*) from ${schema.users}) as total_users,
      (select count(*) from ${schema.users} where created_at >= now() - interval '7 days') as signups_7d,
      (select count(*) from ${schema.reviews} where created_at >= now() - interval '7 days') as reviews_7d,
      (select count(*) from ${schema.users}
         where is_premium and (premium_expires_at is null or premium_expires_at + interval '1 day' > now())) as premium_users,
      (select count(*) from ${schema.teaRequests} where status = 'pending') as pending_requests,
      (select count(*) from ${schema.reports} where status = 'pending') as pending_reports
  `)
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Record<string, string | number>[]
  const r = rows[0]
  return {
    totalTeas: Number(r.total_teas),
    totalReviews: Number(r.total_reviews),
    totalUsers: Number(r.total_users),
    signupsLast7Days: Number(r.signups_7d),
    reviewsLast7Days: Number(r.reviews_7d),
    premiumUsers: Number(r.premium_users),
    pendingTeaRequests: Number(r.pending_requests),
    pendingReports: Number(r.pending_reports),
  }
}
