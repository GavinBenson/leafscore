import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { db } from '@/db/client'
import { createOrUpdateUser } from '@/lib/data/users'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google,
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false
      await createOrUpdateUser(db, {
        email: user.email,
        name: user.name ?? user.email.split('@')[0],
        avatarUrl: user.image ?? undefined,
      })
      return true
    },
    async session({ session }) {
      if (session.user?.email) {
        const { getUserByEmail } = await import('@/lib/data/users')
        const dbUser = await getUserByEmail(db, session.user.email)
        if (dbUser) {
          (session.user as any).id = dbUser.id
          ;(session.user as any).isPremium = dbUser.isPremium
          ;(session.user as any).isAdmin = dbUser.isAdmin
        }
      }
      return session
    },
  },
})
