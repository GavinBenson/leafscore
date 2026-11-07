import NextAuth from 'next-auth'
import type { Adapter, AdapterUser } from 'next-auth/adapters'
import Google from 'next-auth/providers/google'
import Resend from 'next-auth/providers/resend'
import { db } from '@/db/client'
import { createOrUpdateUser, getUserByEmail, getUserById } from '@/lib/data/users'
import { magicLinkEmail } from '@/lib/email/magicLink'
import { hasPremium } from '@/lib/premium'
import { users, verificationTokens } from '@/db/schema'
import type { User } from '@/db/schema'
import { eq, and } from 'drizzle-orm'

function toAdapterUser(user: User): AdapterUser {
  return {
    id: String(user.id),
    email: user.email,
    name: user.name,
    image: user.avatarUrl,
    emailVerified: null,
  }
}

// Minimal adapter backed by the existing `users` table. Sessions are JWTs and
// there is no `accounts` table, so OAuth accounts are matched by email only.
const adapter: Adapter = {
  async createUser(data) {
    const user = await createOrUpdateUser(db, {
      email: data.email,
      name: data.name ?? data.email.split('@')[0],
      avatarUrl: data.image ?? undefined,
    })
    return toAdapterUser(user)
  },
  async getUser(id) {
    const userId = Number(id)
    if (!Number.isInteger(userId)) return null
    const user = await getUserById(db, userId)
    return user ? toAdapterUser(user) : null
  },
  async getUserByEmail(email) {
    const user = await getUserByEmail(db, email)
    return user ? toAdapterUser(user) : null
  },
  async getUserByAccount() {
    return null
  },
  async updateUser(data) {
    const userId = Number(data.id)
    const [user] = await db
      .update(users)
      .set({
        ...(data.name ? { name: data.name } : {}),
        ...(data.image !== undefined ? { avatarUrl: data.image } : {}),
      })
      .where(eq(users.id, userId))
      .returning()
    if (!user) throw new Error(`User ${data.id} not found`)
    return toAdapterUser(user)
  },
  async linkAccount() {},
  async createVerificationToken(data) {
    await db.insert(verificationTokens).values(data)
    return data
  },
  async useVerificationToken({ identifier, token }) {
    const [row] = await db
      .delete(verificationTokens)
      .where(and(eq(verificationTokens.identifier, identifier), eq(verificationTokens.token, token)))
      .returning()
    return row ?? null
  },
}

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
  adapter,
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
      if (session.user?.email) {
        const dbUser = await getUserByEmail(db, session.user.email)
        if (dbUser) {
          (session.user as any).id = dbUser.id
          ;(session.user as any).isPremium = hasPremium(dbUser)
          ;(session.user as any).isAdmin = dbUser.isAdmin
        }
      }
      return session
    },
  },
})
