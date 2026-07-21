import { auth } from '@/lib/auth'

export async function getCurrentUser() {
  const session = await auth()
  if (!session?.user) return null
  const user = session.user as any
  return {
    id: user.id as number,
    email: user.email ?? '',
    name: user.name ?? '',
    image: user.image ?? null,
    isPremium: user.isPremium as boolean,
    isAdmin: user.isAdmin as boolean,
  }
}
