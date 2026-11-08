import NextAuth, { type Session } from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { db } from '@/db/client'
import { createAdapter } from '@/lib/authAdapter'
import { getUserByEmail, getUserById, updateUserProfile } from '@/lib/data/users'
import { magicLinkEmail } from '@/lib/email/magicLink'
import { hasPremium } from '@/lib/premium'

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Google verifies email ownership, so linking to an existing user with the
    // same email (e.g. one created via magic link) is safe.
    Google({ allowDangerousEmailAccountLinking: true }),
    Resend({
      from: process.env.AUTH_RESEND_FROM ?? 'LeafScore <noreply@tea-ratings.com>',
      async sendVerificationRequest({ identifier, url, provider }) {
        const { subject, html, text } = magicLinkEmail(url)
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${provider.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ from: provider.from, to: identifier, subject, html, text }),
        })
        if (!res.ok) {
          throw new Error(`Resend error ${res.status}: ${await res.text()}`)
        }
      },
    }),
  ],
  adapter: createAdapter(db),
  session: { strategy: 'jwt' },
  pages: {
    signIn: '/signin',
    error: '/signin',
  },
  events: {
    // Keep the avatar in sync with the Google profile on every sign-in. The name
    // is not synced: users can edit it in Settings and a sync would overwrite
    // that. `user` here is the database row, so fresh values are on `profile`.
    async signIn({ user, account, profile }) {
      const userId = Number(user.id)
      if (account?.type === 'oidc' && Number.isSafeInteger(userId)) {
        await updateUserProfile(db, userId, {
          avatarUrl: typeof profile?.picture === 'string' ? profile.picture : undefined,
        })
      }
    },
  },
  callbacks: {
    // Banned users can't start a session (Google or magic link). Sessions that
    // already exist are cut off in the session callback below.
    async signIn({ user }) {
      const email = user.email
      if (!email) return true
      const existing = await getUserByEmail(db, email)
      return !existing?.bannedAt
    },
    async session({ session, token }) {
      // Look up by id so a changed email can't detach a session from its user.
      // Cookies from before the adapter existed hold Google's id in `sub`, which
      // is too large to be one of ours, so those fall back to email.
      const userId = Number(token.sub)
      const dbUser = Number.isSafeInteger(userId) && userId > 0
        ? await getUserById(db, userId)
        : session.user?.email
          ? await getUserByEmail(db, session.user.email)
          : null
      if (!dbUser) return session

      const result: Session = {
        expires: session.expires,
        user: {
          name: dbUser.name || session.user.name,
          email: session.user.email,
          image: session.user.image,
          id: String(dbUser.id),
          isPremium: hasPremium(dbUser),
          isAdmin: dbUser.isAdmin ?? false,
          isBanned: dbUser.bannedAt != null,
        },
      }
      return result
    },
  },
})
