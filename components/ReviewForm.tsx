'use client'

import Image from 'next/image'
import Link from 'next/link'
import {
  startTransition,
  useActionState,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import type { FlavorTag } from '@/db/schema'
import { TeaSearch } from '@/components/TeaSearch'
import { scoreTier } from '@/components/LeafScoreBadge'
import { saveReviewEdit, submitReview, type ReviewFormState } from '@/actions/reviews'
import { MAX_PHOTO_BYTES, PHOTO_ACCEPT, PHOTO_TOO_LARGE } from '@/lib/validation/photo'
import { MAX_NOTES_LENGTH, MAX_STEEP_SECONDS, SUB_SCORE_FIELDS, type SubScoreField } from '@/lib/validation/review'
import { celsiusToFahrenheit, type TemperatureUnit } from '@/lib/units'

type Props = {
  tea?: { id: number; name: string } | null
  flavorTags: FlavorTag[]
  // Display unit for the brew temperature; the saved value is always Celsius.
  temperatureUnit?: TemperatureUnit
  // The user's blind-tasting default, for the "Rate before seeing the score" toggle (new reviews).
  blindTasting?: boolean
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
    aromaScore?: number | null
    flavorScore?: number | null
    bodyScore?: number | null
    aftertasteScore?: number | null
    valueScore?: number | null
  }
}

const SUB_SCORE_LABELS: Record<SubScoreField, string> = {
  aromaScore: 'Aroma',
  flavorScore: 'Flavor',
  bodyScore: 'Body',
  aftertasteScore: 'Aftertaste',
  valueScore: 'Value',
}

const initialState: ReviewFormState = {}

// Field order on the page; focus goes to the first one with an error.
const FIELD_ORDER = [
  'teaId',
  'score',
  ...SUB_SCORE_FIELDS,
  'brewMethod',
  'brewTemp',
  'steepTime',
  'notes',
  'photo',
  'tagIds',
] as const

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null
  return (
    <p id={id} className="field-error">
      {message}
    </p>
  )
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Math.round(value)))
}

export function ReviewForm({
  tea: initialTea,
  flavorTags,
  review,
  temperatureUnit = 'c',
  blindTasting = false,
}: Props) {
  const [state, formAction, isPending] = useActionState(
    review ? saveReviewEdit : submitReview,
    initialState,
  )
  const uid = useId()
  const fid = (name: string) => `${uid}-${name}`
  const errors = state.fieldErrors ?? {}
  const messageRef = useRef<HTMLParagraphElement>(null)
  const [selectedTea, setSelectedTea] = useState<{
    id: number
    name: string
  } | null>(initialTea ?? null)
  // Selecting or changing the tea swaps the input for the name (or back), which
  // would drop keyboard focus to <body>; this asks the effect below to restore it.
  const refocusTea = useRef(false)
  useEffect(() => {
    if (!refocusTea.current) return
    refocusTea.current = false
    document.getElementById(`${uid}-teaId`)?.focus()
  }, [selectedTea, uid])
  const [score, setScore] = useState(review?.score ?? 75)
  const [scoreText, setScoreText] = useState(String(review?.score ?? 75))
  const [selectedTagIds, setSelectedTagIds] = useState<Set<number>>(
    new Set(review?.tagIds ?? []),
  )
  const [wouldDrinkAgain, setWouldDrinkAgain] = useState(review?.wouldDrinkAgain ?? true)
  const [photoTooLarge, setPhotoTooLarge] = useState(false)
  const [blind, setBlind] = useState(blindTasting)
  const [detailsOpen, setDetailsOpen] = useState(
    SUB_SCORE_FIELDS.some((field) => review?.[field] != null),
  )
  const hasSubScoreError = SUB_SCORE_FIELDS.some((field) => Boolean(errors[field]))
  const isF = temperatureUnit === 'f'
  const storedTemp = review?.brewTemp ?? null
  const tempDefault =
    storedTemp === null ? '' : isF ? Math.round(celsiusToFahrenheit(storedTemp)) : storedTemp

  // After a failed submit, move focus to the first invalid field (or the
  // top-level message when there is no field error) so keyboard and screen
  // reader users land on the problem instead of the bottom of the form.
  useEffect(() => {
    const fieldErrors = state.fieldErrors ?? {}
    const first = FIELD_ORDER.find((name) => fieldErrors[name])
    if (first) {
      document.getElementById(`${uid}-${first}`)?.focus()
    } else if (state.message) {
      messageRef.current?.focus()
    }
  }, [state, uid])

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

  function handleScoreNumber(text: string) {
    setScoreText(text)
    const parsed = Number(text)
    if (text.trim() !== '' && Number.isFinite(parsed)) setScore(clampScore(parsed))
  }

  const tier = scoreTier(score).word
  const describedBy = (name: string, hasError: boolean, extra?: string) =>
    [hasError ? fid(`${name}-error`) : null, extra].filter(Boolean).join(' ') || undefined

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
        <p ref={messageRef} tabIndex={-1} className="form-error" role="alert">
          {state.message}
          {state.existingReviewId && (
            <>
              {' '}
              <Link href={`/reviews/${state.existingReviewId}/edit`}>Edit your review</Link>
            </>
          )}
        </p>
      )}

      {review && <input type="hidden" name="reviewId" value={review.id} />}

      {/* Tea selection */}
      <div className="form-group">
        {!selectedTea ? (
          <>
            <label htmlFor={fid('teaId')} className="form-label">
              Which tea?
            </label>
            <TeaSearch
              id={fid('teaId')}
              onSelect={(tea) => {
                refocusTea.current = true
                setSelectedTea(tea)
              }}
              invalid={Boolean(errors.teaId)}
              describedBy={describedBy('teaId', Boolean(errors.teaId))}
            />
          </>
        ) : (
          <>
            <div className="selected-tea">
              <span id={fid('teaId')} tabIndex={-1} className="selected-tea-name">
                {selectedTea.name}
              </span>
              {!initialTea && !review && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    refocusTea.current = true
                    setSelectedTea(null)
                  }}
                >
                  Change
                </button>
              )}
            </div>
            <input type="hidden" name="teaId" value={selectedTea.id} />
          </>
        )}
        <FieldError id={fid('teaId-error')} message={errors.teaId} />
      </div>

      {/* Score: slider and number input stay in sync; the hidden input is what submits */}
      <div className="form-group">
        <label htmlFor={fid('score')} className="form-label">
          Score: {score} <span className="score-tier">({tier})</span>
        </label>
        <input type="hidden" name="score" value={score} />
        <div className="score-row">
          <div className="score-range-wrap">
            <input
              id={fid('score')}
              type="range"
              min={0}
              max={100}
              value={score}
              className="score-range"
              aria-valuetext={`${score} out of 100, ${tier.toLowerCase()}`}
              aria-invalid={Boolean(errors.score)}
              aria-describedby={describedBy('score', Boolean(errors.score), fid('score-scale'))}
              onChange={(e) => {
                const next = Number(e.target.value)
                setScore(next)
                setScoreText(String(next))
              }}
            />
            <div id={fid('score-scale')} className="score-scale" aria-hidden="true">
              <span>0</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>
          <div>
            <label htmlFor={fid('score-number')} className="visually-hidden">
              Score as a number, 0 to 100
            </label>
            <input
              id={fid('score-number')}
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              className="field score-number"
              value={scoreText}
              aria-invalid={Boolean(errors.score)}
              aria-describedby={describedBy('score', Boolean(errors.score))}
              onChange={(e) => handleScoreNumber(e.target.value)}
              onBlur={() => setScoreText(String(score))}
            />
          </div>
        </div>
        <FieldError id={fid('score-error')} message={errors.score} />
      </div>

      {/* Optional rubric. Never changes the LeafScore. */}
      <details
        className="form-group"
        open={detailsOpen || hasSubScoreError}
        onToggle={(e) => setDetailsOpen(e.currentTarget.open)}
      >
        <summary className="form-label" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
          Detailed ratings (optional)
        </summary>
        <p id={fid('sub-hint')} className="form-hint" style={{ marginTop: 0 }}>
          Rate any of these from 0 to 100, or leave them empty. They are shown on your review and
          do not change the tea&apos;s LeafScore.
        </p>
        {SUB_SCORE_FIELDS.map((field) => (
          <div key={field} className="form-group">
            <label htmlFor={fid(field)} className="form-label">
              {SUB_SCORE_LABELS[field]} (0 to 100)
            </label>
            <input
              id={fid(field)}
              type="number"
              name={field}
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              className="field score-number"
              defaultValue={review?.[field] ?? ''}
              aria-invalid={Boolean(errors[field])}
              aria-describedby={describedBy(field, Boolean(errors[field]), fid('sub-hint'))}
            />
            <FieldError id={fid(`${field}-error`)} message={errors[field]} />
          </div>
        ))}
      </details>

      {/* Brew method */}
      <div className="form-group">
        <label htmlFor={fid('brewMethod')} className="form-label">
          Brew method
        </label>
        <select
          id={fid('brewMethod')}
          name="brewMethod"
          className="field"
          defaultValue={review?.brewMethod ?? ''}
          aria-invalid={Boolean(errors.brewMethod)}
          aria-describedby={describedBy('brewMethod', Boolean(errors.brewMethod))}
        >
          <option value="">-- Select --</option>
          <option value="gongfu">Gongfu</option>
          <option value="western">Western</option>
          <option value="cold_brew">Cold Brew</option>
          <option value="grandpa">Grandpa</option>
        </select>
        <FieldError id={fid('brewMethod-error')} message={errors.brewMethod} />
      </div>

      {/* Brew temp */}
      <div className="form-group">
        <label htmlFor={fid('brewTemp')} className="form-label">
          Brew temperature ({isF ? '°F' : '°C'}, optional)
        </label>
        <input type="hidden" name="brewTempUnit" value={temperatureUnit} />
        <input
          id={fid('brewTemp')}
          type="number"
          name="brewTemp"
          className="field"
          inputMode="numeric"
          placeholder={isF ? 'e.g. 185' : 'e.g. 85'}
          min={isF ? 32 : 0}
          max={isF ? 212 : 100}
          defaultValue={tempDefault}
          aria-invalid={Boolean(errors.brewTemp)}
          aria-describedby={describedBy('brewTemp', Boolean(errors.brewTemp))}
        />
        <FieldError id={fid('brewTemp-error')} message={errors.brewTemp} />
      </div>

      {/* Steep time */}
      <div className="form-group">
        <label htmlFor={fid('steepTime')} className="form-label">
          Steep time (seconds, optional)
        </label>
        <input
          id={fid('steepTime')}
          type="number"
          name="steepTime"
          className="field"
          placeholder="e.g. 30"
          min={0}
          max={MAX_STEEP_SECONDS}
          defaultValue={review?.steepTime ?? ''}
          aria-invalid={Boolean(errors.steepTime)}
          aria-describedby={describedBy('steepTime', Boolean(errors.steepTime))}
        />
        <FieldError id={fid('steepTime-error')} message={errors.steepTime} />
      </div>

      {/* Notes */}
      <div className="form-group">
        <label htmlFor={fid('notes')} className="form-label">
          Notes
        </label>
        <textarea
          id={fid('notes')}
          name="notes"
          className="field field-textarea"
          placeholder="How was it? Tasting notes, aroma, mouthfeel..."
          maxLength={MAX_NOTES_LENGTH}
          defaultValue={review?.notes ?? ''}
          aria-invalid={Boolean(errors.notes)}
          aria-describedby={describedBy('notes', Boolean(errors.notes))}
        />
        <FieldError id={fid('notes-error')} message={errors.notes} />
      </div>

      {/* Photo */}
      <div className="form-group">
        <label htmlFor={fid('photo')} className="form-label">
          Photo (optional, up to 4MB)
        </label>
        {review?.photoUrl && (
          <div>
            <Image
              src={review.photoUrl}
              alt="Current review photo"
              width={160}
              height={120}
              className="photo-preview"
            />
            <div className="check-label">
              <input
                id={fid('removePhoto')}
                type="checkbox"
                name="removePhoto"
                value="true"
              />
              <label htmlFor={fid('removePhoto')}>Remove this photo</label>
            </div>
          </div>
        )}
        <input
          id={fid('photo')}
          type="file"
          name="photo"
          accept={PHOTO_ACCEPT}
          className="file-input"
          aria-invalid={Boolean(errors.photo) || photoTooLarge}
          aria-describedby={describedBy('photo', Boolean(errors.photo) || photoTooLarge)}
          onChange={(e) => {
            const file = e.target.files?.[0]
            setPhotoTooLarge(Boolean(file && file.size > MAX_PHOTO_BYTES))
          }}
        />
        <FieldError
          id={fid('photo-error')}
          message={photoTooLarge ? PHOTO_TOO_LARGE : errors.photo}
        />
      </div>

      {/* Would drink again */}
      <div className="form-group">
        <div className="check-label check-label-strong">
          <input
            id={fid('again')}
            type="checkbox"
            checked={wouldDrinkAgain}
            onChange={(e) => setWouldDrinkAgain(e.target.checked)}
          />
          <label htmlFor={fid('again')}>Would drink again</label>
        </div>
        <input
          type="hidden"
          name="wouldDrinkAgain"
          value={wouldDrinkAgain ? 'true' : 'false'}
        />
      </div>

      {/* Flavor tags */}
      <fieldset
        id={fid('tagIds')}
        tabIndex={-1}
        className="form-group"
        aria-describedby={describedBy('tagIds', Boolean(errors.tagIds))}
      >
        <legend className="form-label">Flavor tags</legend>
        {Object.entries(tagsByCategory).map(([category, tags]) => (
          <div
            key={category}
            role="group"
            aria-labelledby={fid(`cat-${category}`)}
            className="tag-category"
          >
            <div id={fid(`cat-${category}`)} className="subtle tag-category-name">
              {category}
            </div>
            <div className="tag-list">
              {tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className="tag tag-toggle"
                  aria-pressed={selectedTagIds.has(tag.id)}
                  onClick={() => toggleTag(tag.id)}
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
        <FieldError id={fid('tagIds-error')} message={errors.tagIds} />
      </fieldset>

      {/* Blind tasting default (new reviews only) */}
      {!review && (
        <div className="form-group">
          <div className="check-label check-label-strong" style={{ minHeight: 44 }}>
            <input
              id={fid('blind')}
              type="checkbox"
              checked={blind}
              aria-describedby={fid('blind-hint')}
              onChange={(e) => setBlind(e.target.checked)}
            />
            <label htmlFor={fid('blind')}>Rate before seeing the score</label>
          </div>
          <p id={fid('blind-hint')} className="form-hint">
            When on, tea pages hide the community score and reviews until you have rated the tea.
            Saved as your default with this review; change it any time in Settings.
          </p>
          <input type="hidden" name="blindTasting" value={blind ? 'true' : 'false'} />
        </div>
      )}

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
