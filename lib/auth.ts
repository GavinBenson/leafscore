import NextAuth, { type Session } from 'next-auth'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { db } from '@/db/client'
import { createAdapter } from '@/lib/authAdapter'
import { createOrUpdateUser, getUserByEmail } from '@/lib/data/users'
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
    // Keep name/avatar in sync with the Google profile on every sign-in.
    async signIn({ user, account }) {
      if (account?.type === 'oidc' && user.email) {
        await createOrUpdateUser(db, {
          email: user.email,
          name: user.name ?? user.email.split('@')[0],
          avatarUrl: user.image ?? undefined,
        })
      }
    },
  },
  callbacks: {
    async session({ session }) {
      const dbUser = session.user?.email
        ? await getUserByEmail(db, session.user.email)
        : null
      if (!dbUser) return session

      const result: Session = {
        expires: session.expires,
        user: {
          name: session.user.name,
          email: session.user.email,
          image: session.user.image,
          id: String(dbUser.id),
          isPremium: hasPremium(dbUser),
          isAdmin: dbUser.isAdmin ?? false,
        },
      }
      return result
    },
  },
})
