import { auth } from '@/lib/auth'

export async function getCurrentUser() {
  const session = await auth()
  const user = session?.user
  if (!user) return null

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
  }
}
