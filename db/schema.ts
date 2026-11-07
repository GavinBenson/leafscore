import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  real,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm'

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  isPremium: boolean('is_premium').default(false),
  stripeCustomerId: text('stripe_customer_id'),
  premiumExpiresAt: timestamp('premium_expires_at'),
  paymentFailedAt: timestamp('payment_failed_at'),
  profilePublic: boolean('profile_public').default(true),
  isAdmin: boolean('is_admin').default(false),
  createdAt: timestamp('created_at').defaultNow(),
})

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  website: text('website'),
  logoUrl: text('logo_url'),
  country: text('country'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const teas = pgTable('teas', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  brandId: integer('brand_id').references(() => brands.id),
  type: text('type').notNull(),
  subtype: text('subtype'),
  origin: text('origin'),
  caffeineLevel: text('caffeine_level', { enum: ['low', 'medium', 'high'] }),
  leafStyle: text('leaf_style', { enum: ['loose', 'bag', 'cake', 'powder'] }),
  imageUrl: text('image_url'),
  leafScore: real('leaf_score'),
  reviewCount: integer('review_count').default(0),
  createdAt: timestamp('created_at').defaultNow(),
})

export const flavorTags = pgTable('flavor_tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').notNull(),
})

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  teaId: integer('tea_id').notNull().references(() => teas.id),
  score: integer('score').notNull(),
  brewMethod: text('brew_method', { enum: ['gongfu', 'western', 'cold_brew', 'grandpa'] }),
  brewTemp: integer('brew_temp'),
  steepTime: integer('steep_time'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  wouldDrinkAgain: boolean('would_drink_again'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const reviewTags = pgTable('review_tags', {
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  flavorTagId: integer('flavor_tag_id').notNull().references(() => flavorTags.id),
}, (table) => [
  uniqueIndex('review_tags_review_id_flavor_tag_id_idx').on(table.reviewId, table.flavorTagId),
])

export const favorites = pgTable('favorites', {
  userId: integer('user_id').notNull().references(() => users.id),
  teaId: integer('tea_id').notNull().references(() => teas.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('favorites_user_id_tea_id_idx').on(table.userId, table.teaId),
])

export const wishlist = pgTable('wishlist', {
  userId: integer('user_id').notNull().references(() => users.id),
  teaId: integer('tea_id').notNull().references(() => teas.id),
  createdAt: timestamp('created_at').defaultNow(),
}, (table) => [
  uniqueIndex('wishlist_user_id_tea_id_idx').on(table.userId, table.teaId),
])

export const teaRequests = pgTable('tea_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  brand: text('brand'),
  type: text('type'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).default('pending'),
  createdAt: timestamp('created_at').defaultNow(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => [
  uniqueIndex('verification_tokens_identifier_token_idx').on(table.identifier, table.token),
])

// Stripe delivers at-least-once; a row here means the event has been handled.
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at').defaultNow(),
})

export const affiliateLinks = pgTable('affiliate_links', {
  id: serial('id').primaryKey(),
  teaId: integer('tea_id').notNull().references(() => teas.id),
  provider: text('provider').notNull(),
  url: text('url').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
})

export type User = InferSelectModel<typeof users>
export type NewUser = InferInsertModel<typeof users>
export type Brand = InferSelectModel<typeof brands>
export type NewBrand = InferInsertModel<typeof brands>
export type Tea = InferSelectModel<typeof teas>
export type NewTea = InferInsertModel<typeof teas>
export type FlavorTag = InferSelectModel<typeof flavorTags>
export type Review = InferSelectModel<typeof reviews>
export type NewReview = InferInsertModel<typeof reviews>
export type Favorite = InferSelectModel<typeof favorites>
export type WishlistItem = InferSelectModel<typeof wishlist>
export type TeaRequest = InferSelectModel<typeof teaRequests>
export type AffiliateLink = InferSelectModel<typeof affiliateLinks>
