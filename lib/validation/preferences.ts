export const TEMP_UNITS = ['c', 'f'] as const
export type TempUnit = (typeof TEMP_UNITS)[number]
export const WEIGHT_UNITS = ['g', 'oz'] as const
export type WeightUnit = (typeof WEIGHT_UNITS)[number]

export type UserPreferencesInput = {
  tempUnit?: TempUnit
  weightUnit?: WeightUnit
  blindTasting?: boolean
}

export type ParsedPreferences =
  | { ok: true; data: UserPreferencesInput }
  | { ok: false; error: string }

// Fields that are undefined are left alone. Anything present must be valid.
export function parseUserPreferences(raw: {
  tempUnit?: unknown
  weightUnit?: unknown
  blindTasting?: unknown
}): ParsedPreferences {
  const data: UserPreferencesInput = {}
  if (raw.tempUnit !== undefined) {
    if (!(TEMP_UNITS as readonly unknown[]).includes(raw.tempUnit)) {
      return { ok: false, error: 'Choose Celsius or Fahrenheit.' }
    }
    data.tempUnit = raw.tempUnit as TempUnit
  }
  if (raw.weightUnit !== undefined) {
    if (!(WEIGHT_UNITS as readonly unknown[]).includes(raw.weightUnit)) {
      return { ok: false, error: 'Choose grams or ounces.' }
    }
    data.weightUnit = raw.weightUnit as WeightUnit
  }
  if (raw.blindTasting !== undefined) {
    if (typeof raw.blindTasting !== 'boolean') {
      return { ok: false, error: 'Blind tasting must be on or off.' }
    }
    data.blindTasting = raw.blindTasting
  }
  return { ok: true, data }
}
