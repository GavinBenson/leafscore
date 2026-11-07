'use client'

import Image from 'next/image'
import { startTransition, useActionState, useState, type FormEvent } from 'react'
import type { FlavorTag } from '@/db/schema'
import { TeaSearch } from '@/components/TeaSearch'
import { saveReviewEdit, submitReview, type ReviewFormState } from '@/actions/reviews'
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT, PHOTO_TOO_LARGE } from '@/lib/validation/photo'
import { MAX_NOTES_LENGTH, MAX_STEEP_SECONDS } from '@/lib/validation/review'

type Props = {
  tea?: { id: number; name: string } | null
  flavorTags: FlavorTag[]
  // When set, the form edits this review instead of creating a new one.
  review?: {
    id: number
    score: number
    brewMethod: string | null
    brewTemp: number | null
    steepTime: number | null
    notes: string | null
    wouldDrinkAgain: boolean | null
    tagIds: number[]
    photoUrl: string | null
  }
}

const initialState: ReviewFormState = {}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="field-error" role="alert">
      {message}
    </p>
  )
}

export function ReviewForm({ tea: initialTea, flavorTags, review }: Props) {
  const [state, formAction, isPending] = useActionState(
    review ? saveReviewEdit : submitReview,
    initialState,
  )
  const errors = state.fieldErrors ?? {}
  const [selectedTea, setSelectedTea] = useState<{
    id: number
    name: string
  } | null>(initialTea ?? null)
  const [score, setScore] = useState(review?.score ?? 75)
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    new Set(review?.tagIds ?? []),
  )
  const [wouldDrinkAgain, setWouldDrinkAgain] = useState(review?.wouldDrinkAgain ?? true)
  const [photoTooLarge, setPhotoTooLarge] = useState(false)

  // Submitting through a transition rather than <form action> skips React's
  // automatic form reset, so a validation error doesn't wipe what was typed.
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // An oversized body would be refused before the action could explain why.
    if (isPending || photoTooLarge) return
    const formData = new FormData(event.currentTarget)
    startTransition(() => formAction(formData))
  }

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
    <form onSubmit={handleSubmit} noValidate>
      {state.message && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}

      {review && <input type="hidden" name="reviewId" value={review.id} />}

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
            {!initialTea && !review && (
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
          <FieldError message={errors.teaId} />
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
        <FieldError message={errors.score} />
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
        <select
          name="brewMethod"
          className="field"
          defaultValue={review?.brewMethod ?? ''}
          aria-invalid={Boolean(errors.brewMethod)}
        >
          <option value="">-- Select --</option>
          <option value="gongfu">Gongfu</option>
          <option value="western">Western</option>
          <option value="cold_brew">Cold Brew</option>
          <option value="grandpa">Grandpa</option>
        </select>
        <FieldError message={errors.brewMethod} />
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
          defaultValue={review?.brewTemp ?? ''}
          aria-invalid={Boolean(errors.brewTemp)}
        />
        <FieldError message={errors.brewTemp} />
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
          max={MAX_STEEP_SECONDS}
          defaultValue={review?.steepTime ?? ''}
          aria-invalid={Boolean(errors.steepTime)}
        />
        <FieldError message={errors.steepTime} />
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
          maxLength={MAX_NOTES_LENGTH}
          defaultValue={review?.notes ?? ''}
          aria-invalid={Boolean(errors.notes)}
        />
        <FieldError message={errors.notes} />
      </div>

      {/* Photo */}
      <div style={{ marginBottom: 24 }}>
        <label
          htmlFor="review-photo"
          style={{
            display: 'block',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 6,
          }}
        >
          Photo (optional, up to 4MB)
        </label>
        {review?.photoUrl && (
          <div style={{ marginBottom: 8 }}>
            <Image
              src={review.photoUrl}
              alt="Current review photo"
              width={160}
              height={120}
              style={{ width: 160, height: 120, objectFit: 'cover', borderRadius: 'var(--radius-md)' }}
            />
            <label
              style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, marginTop: 4 }}
            >
              <input type="checkbox" name="removePhoto" value="true" />
              Remove this photo
            </label>
          </div>
        )}
        <input
          id="review-photo"
          type="file"
          name="photo"
          accept={PHOTO_ACCEPT}
          aria-invalid={Boolean(errors.photo) || photoTooLarge}
          style={{ display: 'block', maxWidth: '100%', fontSize: 14 }}
          onChange={(e) => {
            const file = e.target.files?.[0]
            setPhotoTooLarge(Boolean(file && file.size > MAX_PHOTO_BYTES))
          }}
        />
        <FieldError message={photoTooLarge ? PHOTO_TOO_LARGE : errors.photo} />
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
        <FieldError message={errors.tagIds} />
      </div>

      {/* Submit */}
      <button
        type="submit"
        className="btn btn-primary"
        disabled={!selectedTea || isPending || photoTooLarge}
        aria-busy={isPending}
      >
        {isPending ? 'Saving...' : review ? 'Save Changes' : 'Submit Review'}
      </button>
    </form>
  )
}
