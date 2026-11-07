import { and, eq } from 'drizzle-orm'
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

export async function getUserByAccount(
  db: Db,
  provider: string,
  providerAccountId: string,
) {
  const rows = await db
    .select({ user: schema.users })
    .from(schema.accounts)
    .innerJoin(schema.users, eq(schema.accounts.userId, schema.users.id))
    .where(
      and(
        eq(schema.accounts.provider, provider),
        eq(schema.accounts.providerAccountId, providerAccountId),
      ),
    )

  return rows[0]?.user ?? null
}

export async function linkAccount(
  db: Db,
  data: { userId: number; provider: string; providerAccountId: string; type: string },
) {
  await db.insert(schema.accounts).values(data).onConflictDoNothing()
}

export async function listLinkedProviders(db: Db, userId: number) {
  const rows = await db
    .select({ provider: schema.accounts.provider })
    .from(schema.accounts)
    .where(eq(schema.accounts.userId, userId))

  return rows.map((row) => row.provider)
}

export async function updateUserProfile(
  db: Db,
  userId: number,
  data: { name?: string; avatarUrl?: string },
) {
  if (data.name === undefined && data.avatarUrl === undefined) return
  await db.update(schema.users).set(data).where(eq(schema.users.id, userId))
}

// Selects only what a stranger may see, so email and billing fields can't leak
// into a profile page. Pass viewerId to let owners see their own private profile.
export async function getPublicProfile(db: Db, userId: number, viewerId?: number) {
  const rows = await db
    .select({
      id: schema.users.id,
      name: schema.users.name,
      avatarUrl: schema.users.avatarUrl,
      profilePublic: schema.users.profilePublic,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, userId))

  const profile = rows[0]
  if (!profile) return null
  if (!profile.profilePublic && profile.id !== viewerId) return null
  return profile
}

export async function setProfilePublic(db: Db, userId: number, profilePublic: boolean) {
  await db.update(schema.users).set({ profilePublic }).where(eq(schema.users.id, userId))
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
