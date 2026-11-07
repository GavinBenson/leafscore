export const FREE_WISHLIST_LIMIT = 25

export const PREMIUM_FEATURES = [
  'Brew stats: your scores by tea type and brew method, plus your top flavors',
  'Export your full tasting journal as a CSV',
  `Unlimited wishlist (free accounts hold ${FREE_WISHLIST_LIMIT} teas)`,
] as const

export function canAddToWishlist(isPremium: boolean, currentCount: number) {
  return isPremium || currentCount < FREE_WISHLIST_LIMIT
}
