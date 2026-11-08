import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { getUserById } from '@/lib/data/users'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export const BANNED_MESSAGE =
  'Your account has been restricted by moderators, so you can no longer post reviews, requests or reports.'

// The session only carries what the JWT held at sign-in, so a ban has to be
// read from the database on every write.
export async function isBanned(db: Db, userId: number): Promise<boolean> {
  const row = await getUserById(db, userId)
  return Boolean(row?.bannedAt)
}
