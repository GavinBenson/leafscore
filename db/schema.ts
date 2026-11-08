import {
  pgTable,
  primaryKey,
  serial,
  text,
  boolean,
  integer,
  real,
  timestamp,
  uniqueIndex,
  index,
  check,
  smallint,
  date,
} from 'drizzle-orm/pg-core'
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm'
import { MAX_REVIEW_SCORE, MIN_REVIEW_SCORE } from '../lib/scoring'

export const REPORT_REASONS = ['spam', 'offensive', 'off_topic', 'fake', 'other'] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  avatarUrl: text('avatar_url'),
  isPremium: boolean('is_premium').notNull().default(false),
  stripeCustomerId: text('stripe_customer_id'),
  premiumExpiresAt: timestamp('premium_expires_at'),
  paymentFailedAt: timestamp('payment_failed_at'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  profilePublic: boolean('profile_public').notNull().default(true),
  isAdmin: boolean('is_admin').notNull().default(false),
  bannedAt: timestamp('banned_at'),
  // Weekly digest email. Opt-in only: never defaults to true.
  digestOptIn: boolean('digest_opt_in').notNull().default(false),
  digestLastSentAt: timestamp('digest_last_sent_at', { withTimezone: true }),
  // Display preferences. Stored data is always °C and grams.
  tempUnit: text('temp_unit', { enum: ['c', 'f'] }).notNull().default('c'),
  weightUnit: text('weight_unit', { enum: ['g', 'oz'] }).notNull().default('g'),
  // Blind tasting: hide the community score and reviews until this user has reviewed the tea.
  blindTasting: boolean('blind_tasting').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  check('users_temp_unit_check', sql`${table.tempUnit} in ('c', 'f')`),
  check('users_weight_unit_check', sql`${table.weightUnit} in ('g', 'oz')`),
])

export const brands = pgTable('brands', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  website: text('website'),
  logoUrl: text('logo_url'),
  country: text('country'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('brands_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
])

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
  reviewCount: integer('review_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('teas_type_leaf_score_idx').on(table.type, table.leafScore.desc()),
  index('teas_brand_id_idx').on(table.brandId),
  index('teas_created_at_idx').on(table.createdAt),
  index('teas_name_trgm_idx').using('gin', table.name.op('gin_trgm_ops')),
])

export const flavorTags = pgTable('flavor_tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  category: text('category').notNull(),
})

export const reviews = pgTable('reviews', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'restrict' }),
  score: integer('score').notNull(),
  brewMethod: text('brew_method', { enum: ['gongfu', 'western', 'cold_brew', 'grandpa'] }),
  brewTemp: integer('brew_temp'),
  steepTime: integer('steep_time'),
  notes: text('notes'),
  photoUrl: text('photo_url'),
  wouldDrinkAgain: boolean('would_drink_again'),
  // Optional rubric sub-scores (0-100). They never feed the LeafScore.
  aromaScore: smallint('aroma_score'),
  flavorScore: smallint('flavor_score'),
  bodyScore: smallint('body_score'),
  aftertasteScore: smallint('aftertaste_score'),
  valueScore: smallint('value_score'),
  // Hidden by a moderator: excluded from public lists and from the tea's average.
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  // One review per user per tea; people edit it rather than posting again.
  uniqueIndex('reviews_user_id_tea_id_idx').on(table.userId, table.teaId),
  index('reviews_tea_id_created_at_idx').on(table.teaId, table.createdAt.desc()),
  index('reviews_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
  check(
    'reviews_score_range',
    sql`${table.score} >= ${sql.raw(String(MIN_REVIEW_SCORE))} and ${table.score} <= ${sql.raw(String(MAX_REVIEW_SCORE))}`,
  ),
  ...(['aroma_score', 'flavor_score', 'body_score', 'aftertaste_score', 'value_score'] as const).map((name) => {
    const column = sql.identifier(name)
    return check(
      `reviews_${name}_range`,
      sql`${column} is null or (${column} >= ${sql.raw(String(MIN_REVIEW_SCORE))} and ${column} <= ${sql.raw(String(MAX_REVIEW_SCORE))})`,
    )
  }),
])

export const reviewTags = pgTable('review_tags', {
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  flavorTagId: integer('flavor_tag_id').notNull().references(() => flavorTags.id),
}, (table) => [
  uniqueIndex('review_tags_review_id_flavor_tag_id_idx').on(table.reviewId, table.flavorTagId),
  index('review_tags_flavor_tag_id_idx').on(table.flavorTagId),
])

export const favorites = pgTable('favorites', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('favorites_user_id_tea_id_idx').on(table.userId, table.teaId),
])

export const wishlist = pgTable('wishlist', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('wishlist_user_id_tea_id_idx').on(table.userId, table.teaId),
])

export const teaRequests = pgTable('tea_requests', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  brand: text('brand'),
  type: text('type'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdTeaId: integer('created_tea_id').references(() => teas.id, { onDelete: 'set null' }),
  resolvedAt: timestamp('resolved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('tea_requests_status_idx').on(table.status),
])

// Links a user to an OAuth identity. Tokens aren't stored: sessions are JWTs and
// nothing calls provider APIs on a user's behalf, so there's no need to hold them.
export const accounts = pgTable('accounts', {
  provider: text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.provider, table.providerAccountId] }),
])

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token: text('token').notNull().unique(),
  expires: timestamp('expires').notNull(),
}, (table) => [
  uniqueIndex('verification_tokens_identifier_token_idx').on(table.identifier, table.token),
])

// Stripe delivers at-least-once. A row is the claim on an event; processed_at is
// set only once it has been handled, so a claim with a null processed_at is retried.
export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
})

export const lists = pgTable('lists', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description'),
  isPublic: boolean('is_public').notNull().default(false),
  // Hidden by a moderator: vanishes from every public read.
  hidden: boolean('hidden').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  index('lists_user_id_idx').on(table.userId),
])

export const listItems = pgTable('list_items', {
  listId: integer('list_id').notNull().references(() => lists.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  addedAt: timestamp('added_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('list_items_list_id_tea_id_idx').on(table.listId, table.teaId),
  index('list_items_list_id_position_idx').on(table.listId, table.position),
  index('list_items_tea_id_idx').on(table.teaId),
])

export const cellarItems = pgTable('cellar_items', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  // Always grams; the unit preference only changes display.
  grams: integer('grams').notNull(),
  purchasedAt: date('purchased_at', { mode: 'string' }),
  priceCents: integer('price_cents'),
  currency: text('currency'),
  lowStockGrams: integer('low_stock_grams'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => [
  uniqueIndex('cellar_items_user_id_tea_id_idx').on(table.userId, table.teaId),
  index('cellar_items_tea_id_idx').on(table.teaId),
  check('cellar_items_grams_check', sql`${table.grams} >= 0`),
  check('cellar_items_price_check', sql`${table.priceCents} is null or ${table.priceCents} >= 0`),
  check('cellar_items_low_stock_check', sql`${table.lowStockGrams} is null or ${table.lowStockGrams} >= 0`),
])

export const brewSessions = pgTable('brew_sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  reviewId: integer('review_id').references(() => reviews.id, { onDelete: 'set null' }),
  method: text('method'),
  tempC: integer('temp_c'),
  gramsUsed: integer('grams_used'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('brew_sessions_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
  index('brew_sessions_tea_id_idx').on(table.teaId),
  index('brew_sessions_review_id_idx').on(table.reviewId),
])

export const brewInfusions = pgTable('brew_infusions', {
  id: serial('id').primaryKey(),
  sessionId: integer('session_id').notNull().references(() => brewSessions.id, { onDelete: 'cascade' }),
  step: integer('step').notNull(),
  seconds: integer('seconds').notNull(),
  rating: smallint('rating'),
  note: text('note'),
}, (table) => [
  uniqueIndex('brew_infusions_session_id_step_idx').on(table.sessionId, table.step),
  check('brew_infusions_seconds_check', sql`${table.seconds} >= 1 and ${table.seconds} <= 3600`),
  check('brew_infusions_rating_check', sql`${table.rating} is null or (${table.rating} >= 0 and ${table.rating} <= 100)`),
])

export const reviewHelpfulVotes = pgTable('review_helpful_votes', {
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reviewId: integer('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  primaryKey({ columns: [table.userId, table.reviewId] }),
  index('review_helpful_votes_review_id_idx').on(table.reviewId),
])

export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  // Exactly one of reviewId and listId is set (reports_one_target).
  reviewId: integer('review_id').references(() => reviews.id, { onDelete: 'cascade' }),
  listId: integer('list_id').references(() => lists.id, { onDelete: 'cascade' }),
  reporterUserId: integer('reporter_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reason: text('reason', { enum: REPORT_REASONS }).notNull(),
  details: text('details'),
  status: text('status', { enum: ['pending', 'dismissed', 'actioned'] }).notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at'),
  // Moderator who resolved it; set null if they are deleted so history survives.
  resolvedBy: integer('resolved_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [
  uniqueIndex('reports_review_id_reporter_user_id_idx').on(table.reviewId, table.reporterUserId),
  uniqueIndex('reports_list_id_reporter_user_id_idx').on(table.listId, table.reporterUserId),
  index('reports_status_idx').on(table.status),
  check('reports_one_target', sql`num_nonnulls(${table.reviewId}, ${table.listId}) = 1`),
])

// Fixed-window counters, one row per limiter key. See lib/rateLimit.ts.
export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
  count: integer('count').notNull(),
})

export const affiliateLinks = pgTable('affiliate_links', {
  id: serial('id').primaryKey(),
  teaId: integer('tea_id').notNull().references(() => teas.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(),
  url: text('url').notNull(),
  // Optional pricing, in minor units (cents) of `currency` (ISO 4217, upper case).
  priceCents: integer('price_cents'),
  currency: text('currency'),
  pricePer100gCents: integer('price_per_100g_cents'),
  // Incremented atomically by /api/out/[id].
  clickCount: integer('click_count').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow(),
}, (table) => [
  index('affiliate_links_tea_id_idx').on(table.teaId),
])

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
export type Report = InferSelectModel<typeof reports>
export type TeaRequest = InferSelectModel<typeof teaRequests>
export type List = InferSelectModel<typeof lists>
export type ListItem = InferSelectModel<typeof listItems>
export type CellarItem = InferSelectModel<typeof cellarItems>
export type BrewSession = InferSelectModel<typeof brewSessions>
export type BrewInfusion = InferSelectModel<typeof brewInfusions>
export type AffiliateLink = InferSelectModel<typeof affiliateLinks>
