'use client'

import { useState } from 'react'
import type { FlavorTag } from '@/db/schema'
import { TeaSearch } from '@/components/TeaSearch'
import { submitReview } from '@/actions/reviews'

type Props = {
  tea?: { id: number; name: string } | null
  flavorTags: FlavorTag[]
}

export function ReviewForm({ tea: initialTea, flavorTags }: Props) {
  const [selectedTea, setSelectedTea] = useState<{
    id: number
    name: string
  } | null>(initialTea ?? null)
  const [score, setScore] = useState(75)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(new Set())
  const [wouldDrinkAgain, setWouldDrinkAgain] = useState(true)

  function toggleTag(id: number) {
    setSelectedTagIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  // Group tags by category
  const tagsByCategory = flavorTags.reduce<Record<string, FlavorTag[]>>(
    (acc, tag) => {
      if (!acc[tag.category]) acc[tag.category] = []
      acc[tag.category].push(tag)
      return acc
    },
    {},
  )

  return (
    <form action={submitReview}>
      {/* Tea selection */}
      {!selectedTea ? (
        <div style={{ marginBottom: 24 }}>
          <label
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            Which tea?
          </label>
          <TeaSearch onSelect={setSelectedTea} />
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 600 }}>{selectedTea.name}</span>
            {!initialTea && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedTea(null)}
              >
                Change
              </button>
            )}
          </div>
          <input type="hidden" name="teaId" value={selectedTea.id} />
        </div>
      )}

      {/* Score slider */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Score: {score}
        </label>
        <input
          type="range"
          name="score"
          min={0}
          max={100}
          value={score}
          onChange={(e) => setScore(Number(e.target.value))}
          className="field"
          style={{ height: 'auto', padding: '8px 0' }}
        />
      </div>

      {/* Brew method */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Brew method
        </label>
        <select name="brewMethod" className="field">
          <option value="">-- Select --</option>
          <option value="gongfu">Gongfu</option>
          <option value="western">Western</option>
          <option value="cold_brew">Cold Brew</option>
          <option value="grandpa">Grandpa</option>
        </select>
      </div>

      {/* Brew temp */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Brew temperature (C, optional)
        </label>
        <input
          type="number"
          name="brewTemp"
          className="field"
          placeholder="e.g. 85"
          min={0}
          max={100}
        />
      </div>

      {/* Steep time */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Steep time (seconds, optional)
        </label>
        <input
          type="number"
          name="steepTime"
          className="field"
          placeholder="e.g. 30"
          min={0}
        />
      </div>

      {/* Notes */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Notes
        </label>
        <textarea
          name="notes"
          className="field"
          style={{ height: 100, padding: '10px 12px', resize: 'vertical' }}
          placeholder="How was it? Tasting notes, aroma, mouthfeel..."
        />
      </div>

      {/* Would drink again */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <input
            type="checkbox"
            checked={wouldDrinkAgain}
            onChange={(e) => setWouldDrinkAgain(e.target.checked)}
          />
          Would drink again
        </label>
        <input
          type="hidden"
          name="wouldDrinkAgain"
          value={wouldDrinkAgain ? 'true' : 'false'}
        />
      </div>

      {/* Flavor tags */}
      <div style={{ marginBottom: 24 }}>
        <label
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Flavor tags
        </label>
        {Object.entries(tagsByCategory).map(([category, tags]) => (
          <div key={category} style={{ marginBottom: 12 }}>
            <div
              className="subtle"
              style={{ marginBottom: 4, textTransform: 'capitalize' }}
            >
              {category}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`tag${selectedTagIds.has(tag.id) ? ' tag-accent' : ''}`}
                  onClick={() => toggleTag(tag.id)}
                  style={{ cursor: 'pointer', border: 'none' }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        ))}
        <input
          type="hidden"
          name="tagIds"
          value={Array.from(selectedTagIds).join(',')}
        />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!selectedTea}
      >
        Submit Review
      </button>
    </form>
  )
}
