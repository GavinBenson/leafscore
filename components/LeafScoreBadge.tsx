type Size = 'sm' | 'md' | 'lg'

export function scoreTier(score: number): { className: string; word: string } {
  if (score >= 75) return { className: 'leaf-score-high', word: 'Great' }
  if (score >= 50) return { className: 'leaf-score-mid', word: 'Okay' }
  return { className: 'leaf-score-low', word: 'Poor' }
}

// size: "sm" (compact, no tier word), "md" (default), "lg" (tea page header).
export function LeafScoreBadge({
  score,
  size = 'md',
}: {
  score: number | null
  size?: Size
}) {
  const sizeClass = size === 'md' ? '' : ` leaf-score-${size}`

  if (score == null) {
    return (
      <span
        role="img"
        aria-label="LeafScore: no score yet"
        className={`leaf-score leaf-score-none${sizeClass}`}
      >
        <span aria-hidden="true">&mdash;</span>
      </span>
    )
  }

  const rounded = Math.round(score)
  const { className, word } = scoreTier(score)

  return (
    <span
      role="img"
      aria-label={`LeafScore ${rounded} out of 100, ${word.toLowerCase()}`}
      className={`leaf-score ${className}${sizeClass}`}
    >
      <span aria-hidden="true">{rounded}</span>
      <span aria-hidden="true" className="leaf-score-tier">
        {word}
      </span>
    </span>
  )
}
