import { and, eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type { Adapter, AdapterUser } from 'next-auth/adapters'
import * as schema from '@/db/schema'
import type { User } from '@/db/schema'
import { createOrUpdateUser, getUserByEmail, getUserById } from '@/lib/data/users'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

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
export function createAdapter(db: Db): Adapter {
  return {
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
        .update(schema.users)
        .set({
          ...(data.name ? { name: data.name } : {}),
          ...(data.image !== undefined ? { avatarUrl: data.image } : {}),
        })
        .where(eq(schema.users.id, userId))
        .returning()
      if (!user) throw new Error(`User ${data.id} not found`)
      return toAdapterUser(user)
    },
    async linkAccount() {},
    async createVerificationToken(data) {
      await db.insert(schema.verificationTokens).values(data)
      return data
    },
    async useVerificationToken({ identifier, token }) {
      const [row] = await db
        .delete(schema.verificationTokens)
        .where(
          and(
            eq(schema.verificationTokens.identifier, identifier),
            eq(schema.verificationTokens.token, token),
          ),
        )
        .returning()
      return row ?? null
    },
  }
}
