import { auth } from '@/lib/auth'

async function resolveUser({ allowBanned }: { allowBanned: boolean }) {
  const session = await auth()
  const user = session?.user
  if (!user) return null

  // A banned user is treated as signed out, even with a valid cookie.
  const isBanned = user.isBanned ?? false
  if (isBanned && !allowBanned) return null

  // A valid cookie whose user row is gone is not a signed-in user.
  const id = Number(user.id)
  if (!Number.isSafeInteger(id) || id < 1) return null

  return {
    id,
    email: user.email ?? '',
    name: user.name ?? '',
    image: user.image ?? null,
    isPremium: user.isPremium ?? false,
    isAdmin: user.isAdmin ?? false,
    isBanned,
  }
}

export async function getCurrentUser() {
  return resolveUser({ allowBanned: false })
}

// ONLY for read-only access to a person's own data (the data export). A banned
// user may download what we hold about them, but must not be able to write, and
// must not be able to delete the account: deleting it would erase the ban.
export async function getCurrentUserAllowBanned() {
  return resolveUser({ allowBanned: true })
}
