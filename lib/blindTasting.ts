// Blind-tasting mode (PBI 43). The community score, review count, reviews,
// similar teas and brew guide anchor a rating, so a signed-in viewer who turned
// blind mode on does not see them on a tea page until they have reviewed it.
//
// The decision is made per request on the server, AFTER the shared anonymous
// page data has been fetched. The viewer is never part of a cache key.
//
// Limits: blind mode applies to the tea page body only. Tea lists (TeaCard),
// search, the home page, page metadata (title/description/Open Graph) and
// the public data feeds still show scores, and the page <title>/description
// is the same for everyone because tea pages are public.
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import type * as schema from '@/db/schema'
import { findReviewByUserAndTea } from '@/lib/data/reviews'
import { getViewerPreferences } from '@/lib/viewerPreferences'

type Db = PgDatabase<PgQueryResultHKT, typeof schema>

/** Pure rule: hide only for a signed-in viewer with blind mode on who has not reviewed yet. */
export function shouldHideCommunityData(input: {
  blindMode: boolean
  signedIn: boolean
  hasReviewed: boolean
}): boolean {
  return input.signedIn && input.blindMode && !input.hasReviewed
}

/**
 * Server-side check for one viewer and tea. Pass `hasReviewed` when the caller
 * already looked it up, to avoid a second query.
 */
export async function isCommunityDataHidden(
  db: Db,
  userId: number | null,
  teaId: number,
  hasReviewed?: boolean,
): Promise<boolean> {
  if (userId === null) return false
  const prefs = await getViewerPreferences(db, userId)
  if (!prefs.blindTasting) return false
  const reviewed = hasReviewed ?? (await findReviewByUserAndTea(db, userId, teaId)) !== null
  return shouldHideCommunityData({ blindMode: true, signedIn: true, hasReviewed: reviewed })
}
