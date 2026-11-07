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
