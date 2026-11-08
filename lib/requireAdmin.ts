import { db } from '@/db/client'
import { isBanned } from '@/lib/banGuard'
import { getCurrentUser } from '@/lib/session'

// The one admin gate for server actions. Call it first, before reading input,
// so a non-admin learns nothing about valid values. The session only carries
// what the JWT held at sign-in, so a ban that landed afterwards is read from
// the database.
export async function requireAdmin() {
  const user = await getCurrentUser()
  if (!user || !user.isAdmin) throw new Error('Forbidden')
  if (await isBanned(db, user.id)) throw new Error('Forbidden')
  return user
}
