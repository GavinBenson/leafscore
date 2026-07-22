import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { db } from '@/db/client'
import { createOrUpdateUser } from '@/lib/data/users'
import { verificationTokens } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google,
    Resend({
      from: process.env.AUTH_RESEND_FROM ?? 'LeafScore <noreply@tea-ratings.com>',
    }),
  ],
  adapter: {
    async createVerificationToken(data) {
      await db.insert(verificationTokens).values(data)
      return data
    },
    async useVerificationToken({ identifier, token }) {
      const [row] = await db
        .select()
        .from(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
      if (!row) return null
      await db
        .delete(verificationTokens)
        .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
      return row
    },
  },
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
