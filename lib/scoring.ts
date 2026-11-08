// Scoring rules shared by the data layer and the UI.
//
// Policy: teas.leaf_score is always the plain average of the tea's non-hidden
// reviews and teas.review_count is their count. A score from one or two
// reviews is noise, so the UI must only show leaf_score when hasPublicScore()
// says so (and should show the review count next to it).

// A tea shows a public LeafScore only once enough people have reviewed it.
export const MIN_REVIEWS_FOR_SCORE = 3

// Keep in sync with the CHECK constraint on reviews.score and parseReviewForm.
export const MIN_REVIEW_SCORE = 0
export const MAX_REVIEW_SCORE = 100

export function hasPublicScore(reviewCount: number | null | undefined): boolean {
  return (reviewCount ?? 0) >= MIN_REVIEWS_FOR_SCORE
}

// The score to show, or null while the tea has too few reviews.
export function displayScore(
  leafScore: number | null | undefined,
  reviewCount: number | null | undefined,
): number | null {
  if (leafScore === null || leafScore === undefined) return null
  return hasPublicScore(reviewCount) ? leafScore : null
}
