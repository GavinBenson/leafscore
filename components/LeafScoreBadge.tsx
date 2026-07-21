export function LeafScoreBadge({ score }: { score: number | null }) {
  if (score == null) {
    return <span className="leaf-score leaf-score-none">&mdash;</span>
  }

  const rounded = Math.round(score)
  const tier =
    score >= 75
      ? 'leaf-score-high'
      : score >= 50
        ? 'leaf-score-mid'
        : 'leaf-score-low'

  return <span className={`leaf-score ${tier}`}>{rounded}</span>
}
