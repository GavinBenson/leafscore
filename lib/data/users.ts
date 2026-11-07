import { eq } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

export async function getUserByEmail(db: Db, email: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))

  return rows[0] ?? null
}

export async function getUserById(db: Db, userId: number) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, userId))

  return rows[0] ?? null
}

export async function createOrUpdateUser(
  db: Db,
  data: { email: string; name: string; avatarUrl?: string },
) {
  const [user] = await db
    .insert(schema.users)
    .values(data)
    .onConflictDoUpdate({
      target: schema.users.email,
      set: {
        name: data.name,
        ...(data.avatarUrl !== undefined ? { avatarUrl: data.avatarUrl } : {}),
      },
    })
    .returning()

  return user
}

export async function getUserByStripeCustomerId(db: Db, customerId: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.stripeCustomerId, customerId))

  return rows[0] ?? null
}

// Fields left undefined are not changed; null clears premiumExpiresAt/paymentFailedAt.
export async function updateUserPremium(
  db: Db,
  userId: number,
  data: {
    isPremium?: boolean
    stripeCustomerId?: string
    premiumExpiresAt?: Date | null
    paymentFailedAt?: Date | null
  },
) {
  const [user] = await db
    .update(schema.users)
    .set(data)
    .where(eq(schema.users.id, userId))
    .returning()

  return user ?? null
}
