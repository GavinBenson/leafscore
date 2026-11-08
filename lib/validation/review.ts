import { isTemperatureUnit, parseTemperatureInput, type TemperatureUnit } from '@/lib/units'

export const BREW_METHODS = ['gongfu', 'western', 'cold_brew', 'grandpa'] as const
export type BrewMethod = (typeof BREW_METHODS)[number]

export const MAX_BREW_TEMP = 100
// Cold brews steep for hours, so allow up to a full day.
export const MAX_STEEP_SECONDS = 86_400
export const MAX_NOTES_LENGTH = 5_000

export const SUB_SCORE_FIELDS = ['aromaScore', 'flavorScore', 'bodyScore', 'aftertasteScore', 'valueScore'] as const
export type SubScoreField = (typeof SUB_SCORE_FIELDS)[number]

export type ReviewField = 'teaId' | 'score' | SubScoreField | 'brewMethod' | 'brewTemp' | 'steepTime' | 'notes' | 'tagIds' | 'photo'
export type ReviewFieldErrors = Partial<Record<ReviewField, string>>

export type ReviewInput = {
  teaId: number
  score: number
  brewMethod: BrewMethod | null
  brewTemp: number | null
  steepTime: number | null
  notes: string | null
  wouldDrinkAgain: boolean | null
  tagIds: number[]
  // Optional rubric sub-scores, 0-100. They never change the LeafScore.
  aromaScore: number | null
  flavorScore: number | null
  bodyScore: number | null
  aftertasteScore: number | null
  valueScore: number | null
}

export type ParsedReview =
  | { ok: true; data: ReviewInput }
  | { ok: false; errors: ReviewFieldErrors }

// The brew temperature is typed in the unit the form showed (the hidden
// 'brewTempUnit' field) and always stored in whole degrees Celsius.
function readTempUnit(formData: FormData): TemperatureUnit {
  const raw = text(formData, 'brewTempUnit')
  return isTemperatureUnit(raw) ? raw : 'c'
}

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

// Whole, non-negative numbers only: rejects '', '1.5', '-1', '1e3' and 'abc'.
function wholeNumber(value: string): number | null {
  return /^\d+$/.test(value) ? Number(value) : null
}

function optionalInRange(
  raw: string,
  max: number,
  message: string,
  field: ReviewField,
  errors: ReviewFieldErrors,
): number | null {
  if (raw === '') return null
  const value = wholeNumber(raw)
  if (value === null || value > max) {
    errors[field] = message
    return null
  }
  return value
}

export function parseReviewForm(formData: FormData): ParsedReview {
  const errors: ReviewFieldErrors = {}

  const teaId = wholeNumber(text(formData, 'teaId'))
  if (teaId === null || teaId < 1 || !Number.isSafeInteger(teaId)) {
    errors.teaId = 'Choose a tea.'
  }

  const score = wholeNumber(text(formData, 'score'))
  if (score === null || score > 100) {
    errors.score = 'Score must be between 0 and 100.'
  }

  const subScores = {} as Record<SubScoreField, number | null>
  for (const field of SUB_SCORE_FIELDS) {
    subScores[field] = optionalInRange(
      text(formData, field),
      100,
      'Score must be a whole number between 0 and 100.',
      field,
      errors,
    )
  }

  const rawMethod = text(formData, 'brewMethod')
  let brewMethod: BrewMethod | null = null
  if (rawMethod !== '') {
    if ((BREW_METHODS as readonly string[]).includes(rawMethod)) {
      brewMethod = rawMethod as BrewMethod
    } else {
      errors.brewMethod = 'Choose a brew method from the list.'
    }
  }

  let brewTemp: number | null
  if (readTempUnit(formData) === 'f') {
    const rawTemp = text(formData, 'brewTemp')
    brewTemp = rawTemp === '' ? null : parseTemperatureInput(rawTemp, 'f')
    if (rawTemp !== '' && (brewTemp === null || brewTemp < 0 || brewTemp > MAX_BREW_TEMP)) {
      errors.brewTemp = 'Temperature must be a whole number from 32 to 212.'
      brewTemp = null
    }
  } else {
    brewTemp = optionalInRange(
      text(formData, 'brewTemp'),
      MAX_BREW_TEMP,
      `Temperature must be a whole number from 0 to ${MAX_BREW_TEMP}.`,
      'brewTemp',
      errors,
    )
  }
  const steepTime = optionalInRange(
    text(formData, 'steepTime'),
    MAX_STEEP_SECONDS,
    `Steep time must be a whole number of seconds, up to ${MAX_STEEP_SECONDS}.`,
    'steepTime',
    errors,
  )

  const notes = text(formData, 'notes')
  if (notes.length > MAX_NOTES_LENGTH) {
    errors.notes = `Notes must be ${MAX_NOTES_LENGTH} characters or fewer.`
  }

  const rawAgain = text(formData, 'wouldDrinkAgain')
  const wouldDrinkAgain = rawAgain === 'true' ? true : rawAgain === 'false' ? false : null

  const rawTags = text(formData, 'tagIds')
  const tagIds: number[] = []
  if (rawTags !== '') {
    for (const part of rawTags.split(',')) {
      const id = wholeNumber(part.trim())
      if (id === null || id < 1 || !Number.isSafeInteger(id)) {
        errors.tagIds = 'One of the flavor tags is not valid.'
        break
      }
      if (!tagIds.includes(id)) tagIds.push(id)
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }

  return {
    ok: true,
    data: {
      teaId: teaId as number,
      score: score as number,
      brewMethod,
      brewTemp,
      steepTime,
      notes: notes === '' ? null : notes,
      wouldDrinkAgain,
      tagIds,
      ...subScores,
    },
  }
}
