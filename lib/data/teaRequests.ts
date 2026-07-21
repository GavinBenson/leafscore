import { eq, desc } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import type { TeaRequest } from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function createTeaRequest(
  db: Db,
  data: { userId: number; name: string; brand?: string; type?: string },
) {
  const [request] = await db
    .insert(schema.teaRequests)
    .values(data)
    .returning()

  return request
}

export async function listPendingRequests(db: Db) {
  return db
    .select()
    .from(schema.teaRequests)
    .where(eq(schema.teaRequests.status, 'pending'))
    .orderBy(desc(schema.teaRequests.createdAt))
}

export async function updateRequestStatus(
  db: Db,
  requestId: number,
  status: 'pending' | 'approved' | 'rejected',
) {
  const [request] = await db
    .update(schema.teaRequests)
    .set({ status })
    .where(eq(schema.teaRequests.id, requestId))
    .returning()

  return request ?? null
}
