import { and, asc, desc, eq, inArray } from 'drizzle-orm'
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import * as schema from '@/db/schema'
import { parseDisplayName } from '@/lib/validation/displayName'
import { parseUserPreferences, type UserPreferencesInput } from '@/lib/validation/preferences'
import { lockTea } from './reviews'
import { recalcLeafScore } from './teas'

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
    cancelAtPeriodEnd?: boolean
  },
) {
  const [user] = await db
    .update(schema.users)
    .set(data)
    .where(eq(schema.users.id, userId))
    .returning()

  return user ?? null
}

// Returns an error message instead of throwing so actions can show it as form state.
export async function updateDisplayName(
  db: Db,
  userId: number,
  name: string,
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const parsed = parseDisplayName(name)
  if (!parsed.ok) return parsed
  const [user] = await db
    .update(schema.users)
    .set({ name: parsed.name })
    .where(eq(schema.users.id, userId))
    .returning({ id: schema.users.id })
  if (!user) return { ok: false, error: "We couldn't find your account." }
  return { ok: true, name: parsed.name }
}

// Display preferences: temperature unit, weight unit, blind tasting. Undefined
// fields are left alone; invalid values are refused (nothing is written). The
// stored review and cellar data is always degrees C and grams.
export async function updateUserPreferences(
  db: Db,
  userId: number,
  prefs: { tempUnit?: unknown; weightUnit?: unknown; blindTasting?: unknown },
): Promise<
  | { ok: true; preferences: Required<UserPreferencesInput> }
  | { ok: false; error: string }
> {
  const parsed = parseUserPreferences(prefs)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.data).length === 0) {
    const user = await getUserById(db, userId)
    if (!user) return { ok: false, error: "We couldn't find your account." }
    return {
      ok: true,
      preferences: { tempUnit: user.tempUnit, weightUnit: user.weightUnit, blindTasting: user.blindTasting },
    }
  }
  const [user] = await db
    .update(schema.users)
    .set(parsed.data)
    .where(eq(schema.users.id, userId))
    .returning({
      tempUnit: schema.users.tempUnit,
      weightUnit: schema.users.weightUnit,
      blindTasting: schema.users.blindTasting,
    })
  if (!user) return { ok: false, error: "We couldn't find your account." }
  return { ok: true, preferences: user }
}

// Removes the user and everything hanging off them in one transaction. The
// caller deletes the blobs and cancels the Stripe subscription afterwards using
// the returned values (do those only after this resolves). Reviews, favorites,
// wishlist, accounts, tea requests, reports, lists (and items), cellar items,
// brew sessions (and infusions) and helpful votes cascade; affected teas are
// recomputed because their reviews disappear.
export async function deleteUserAccount(
  db: Db,
  userId: number,
): Promise<{ photoUrls: string[]; stripeCustomerId: string | null } | null> {
  return db.transaction(async (tx) => {
    const [user] = await tx.select().from(schema.users).where(eq(schema.users.id, userId))
    if (!user) return null

    const reviewRows = await tx
      .select({ teaId: schema.reviews.teaId, photoUrl: schema.reviews.photoUrl })
      .from(schema.reviews)
      .where(eq(schema.reviews.userId, userId))
    const teaIds = [...new Set(reviewRows.map((r) => r.teaId))].sort((a, b) => a - b)
    for (const teaId of teaIds) await lockTea(tx, teaId)

    await tx
      .delete(schema.verificationTokens)
      .where(eq(schema.verificationTokens.identifier, user.email))
    await tx.delete(schema.users).where(eq(schema.users.id, userId))

    for (const teaId of teaIds) await recalcLeafScore(tx, teaId)

    return {
      photoUrls: reviewRows.map((r) => r.photoUrl).filter((url): url is string => !!url),
      stripeCustomerId: user.stripeCustomerId,
    }
  })
}

// Everything a user has written, as plain JSON-able data (dates as ISO strings).
export async function exportUserData(db: Db, userId: number) {
  const user = await getUserById(db, userId)
  if (!user) return null

  const reviews = await db
    .select({
      review: schema.reviews,
      teaName: schema.teas.name,
      brandName: schema.brands.name,
    })
    .from(schema.reviews)
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.reviews.userId, userId))
    .orderBy(desc(schema.reviews.createdAt), asc(schema.reviews.id))

  const reviewIds = reviews.map((r) => r.review.id)
  const tagRows =
    reviewIds.length === 0
      ? []
      : await db
          .select({ reviewId: schema.reviewTags.reviewId, name: schema.flavorTags.name })
          .from(schema.reviewTags)
          .innerJoin(schema.flavorTags, eq(schema.reviewTags.flavorTagId, schema.flavorTags.id))
          .where(inArray(schema.reviewTags.reviewId, reviewIds))
          .orderBy(asc(schema.flavorTags.name))

  const teaList = async (table: typeof schema.favorites | typeof schema.wishlist) =>
    db
      .select({ tea: schema.teas.name, brand: schema.brands.name, addedAt: table.createdAt })
      .from(table)
      .innerJoin(schema.teas, eq(table.teaId, schema.teas.id))
      .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
      .where(eq(table.userId, userId))
      .orderBy(asc(schema.teas.name))

  const iso = (d: Date | null) => (d ? d.toISOString() : null)

  const listRows = await db
    .select()
    .from(schema.lists)
    .where(eq(schema.lists.userId, userId))
    .orderBy(asc(schema.lists.id))
  const listIds = listRows.map((l) => l.id)
  const itemRows =
    listIds.length === 0
      ? []
      : await db
          .select({
            listId: schema.listItems.listId,
            tea: schema.teas.name,
            brand: schema.brands.name,
            position: schema.listItems.position,
            addedAt: schema.listItems.addedAt,
          })
          .from(schema.listItems)
          .innerJoin(schema.teas, eq(schema.listItems.teaId, schema.teas.id))
          .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
          .where(inArray(schema.listItems.listId, listIds))
          .orderBy(asc(schema.listItems.position), asc(schema.teas.id))

  const cellarRows = await db
    .select({ item: schema.cellarItems, tea: schema.teas.name, brand: schema.brands.name })
    .from(schema.cellarItems)
    .innerJoin(schema.teas, eq(schema.cellarItems.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.cellarItems.userId, userId))
    .orderBy(asc(schema.teas.name), asc(schema.cellarItems.id))

  const sessionRows = await db
    .select({ session: schema.brewSessions, tea: schema.teas.name, brand: schema.brands.name })
    .from(schema.brewSessions)
    .innerJoin(schema.teas, eq(schema.brewSessions.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.brewSessions.userId, userId))
    .orderBy(desc(schema.brewSessions.createdAt), asc(schema.brewSessions.id))
  const sessionIds = sessionRows.map((s) => s.session.id)
  const infusionRows =
    sessionIds.length === 0
      ? []
      : await db
          .select()
          .from(schema.brewInfusions)
          .where(inArray(schema.brewInfusions.sessionId, sessionIds))
          .orderBy(asc(schema.brewInfusions.step))

  const voteRows = await db
    .select({
      reviewId: schema.reviewHelpfulVotes.reviewId,
      tea: schema.teas.name,
      brand: schema.brands.name,
      votedAt: schema.reviewHelpfulVotes.createdAt,
    })
    .from(schema.reviewHelpfulVotes)
    .innerJoin(schema.reviews, eq(schema.reviewHelpfulVotes.reviewId, schema.reviews.id))
    .innerJoin(schema.teas, eq(schema.reviews.teaId, schema.teas.id))
    .leftJoin(schema.brands, eq(schema.teas.brandId, schema.brands.id))
    .where(eq(schema.reviewHelpfulVotes.userId, userId))
    .orderBy(desc(schema.reviewHelpfulVotes.createdAt), asc(schema.reviewHelpfulVotes.reviewId))

  return {
    profile: { name: user.name, email: user.email, createdAt: iso(user.createdAt) },
    preferences: { tempUnit: user.tempUnit, weightUnit: user.weightUnit, blindTasting: user.blindTasting },
    reviews: reviews.map(({ review, teaName, brandName }) => ({
      tea: teaName,
      brand: brandName,
      score: review.score,
      brewMethod: review.brewMethod,
      brewTemp: review.brewTemp,
      steepTime: review.steepTime,
      notes: review.notes,
      photoUrl: review.photoUrl,
      wouldDrinkAgain: review.wouldDrinkAgain,
      aromaScore: review.aromaScore,
      flavorScore: review.flavorScore,
      bodyScore: review.bodyScore,
      aftertasteScore: review.aftertasteScore,
      valueScore: review.valueScore,
      flavors: tagRows.filter((t) => t.reviewId === review.id).map((t) => t.name),
      createdAt: iso(review.createdAt),
    })),
    favorites: (await teaList(schema.favorites)).map((r) => ({ ...r, addedAt: iso(r.addedAt) })),
    wishlist: (await teaList(schema.wishlist)).map((r) => ({ ...r, addedAt: iso(r.addedAt) })),
    lists: listRows.map((list) => ({
      title: list.title,
      description: list.description,
      isPublic: list.isPublic,
      createdAt: iso(list.createdAt),
      updatedAt: iso(list.updatedAt),
      teas: itemRows
        .filter((i) => i.listId === list.id)
        .map((i) => ({ tea: i.tea, brand: i.brand, position: i.position, addedAt: iso(i.addedAt) })),
    })),
    // Grams, as stored.
    cellar: cellarRows.map(({ item, tea, brand }) => ({
      tea,
      brand,
      grams: item.grams,
      purchasedAt: item.purchasedAt,
      priceCents: item.priceCents,
      currency: item.currency,
      lowStockGrams: item.lowStockGrams,
      notes: item.notes,
      createdAt: iso(item.createdAt),
      updatedAt: iso(item.updatedAt),
    })),
    sessions: sessionRows.map(({ session, tea, brand }) => ({
      tea,
      brand,
      method: session.method,
      tempC: session.tempC,
      gramsUsed: session.gramsUsed,
      notes: session.notes,
      linkedReviewId: session.reviewId,
      createdAt: iso(session.createdAt),
      infusions: infusionRows
        .filter((i) => i.sessionId === session.id)
        .map((i) => ({ step: i.step, seconds: i.seconds, rating: i.rating, note: i.note })),
    })),
    helpfulVotes: voteRows.map((v) => ({
      reviewId: v.reviewId,
      tea: v.tea,
      brand: v.brand,
      votedAt: iso(v.votedAt),
    })),
  }
}

export async function banUser(db: Db, userId: number) {
  await db.update(schema.users).set({ bannedAt: new Date() }).where(eq(schema.users.id, userId))
}
