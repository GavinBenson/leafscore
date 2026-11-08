export const FREE_WISHLIST_LIMIT = 25

export const PREMIUM_FEATURES = [
  'Brew stats: your scores by tea type and brew method, plus your top flavors',
  'Export your full tasting journal as a CSV',
  `Unlimited wishlist (free accounts hold ${FREE_WISHLIST_LIMIT} teas)`,
] as const

// Renewals extend premiumExpiresAt through a webhook, so allow a day for that to
// arrive. A missed cancellation webhook still ends access at the expiry date.
const EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000

export function hasPremium(
  user: { isPremium: boolean | null; premiumExpiresAt: Date | null },
  now = new Date(),
) {
  if (!user.isPremium) return false
  if (!user.premiumExpiresAt) return true
  return user.premiumExpiresAt.getTime() + EXPIRY_GRACE_MS > now.getTime()
}

export function canAddToWishlist(isPremium: boolean, currentCount: number) {
  return isPremium || currentCount < FREE_WISHLIST_LIMIT
}

export const FREE_LIST_LIMIT = 3
export const PREMIUM_LIST_LIMIT = 50
export const MAX_TEAS_PER_LIST = 200
export const FREE_SESSION_LIMIT = 3

export function listLimitFor(isPremium: boolean) {
  return isPremium ? PREMIUM_LIST_LIMIT : FREE_LIST_LIMIT
}

export function canCreateList(isPremium: boolean, currentCount: number) {
  return currentCount < listLimitFor(isPremium)
}

// The cellar is Premium only. The action layer must check this on every write and read.
export function canUseCellar(isPremium: boolean) {
  return isPremium
}

// Free accounts keep a few saved sessions; Premium is unlimited.
export function canSaveSession(isPremium: boolean, currentCount: number) {
  return isPremium || currentCount < FREE_SESSION_LIMIT
}
