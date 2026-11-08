// Unit helpers (PBI 42 core). Values are always STORED in degrees Celsius and
// grams; these functions only convert for display and for parsing input.
// Nothing here mutates a stored value.

export type TemperatureUnit = 'c' | 'f'
export type WeightUnit = 'g' | 'oz'

export const TEMPERATURE_UNITS: readonly TemperatureUnit[] = ['c', 'f']
export const WEIGHT_UNITS: readonly WeightUnit[] = ['g', 'oz']

const GRAMS_PER_OUNCE = 28.349523125

export function isTemperatureUnit(value: unknown): value is TemperatureUnit {
  return value === 'c' || value === 'f'
}

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'g' || value === 'oz'
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return ((fahrenheit - 32) * 5) / 9
}

export function gramsToOunces(grams: number): number {
  return grams / GRAMS_PER_OUNCE
}

export function ouncesToGrams(ounces: number): number {
  return ounces * GRAMS_PER_OUNCE
}

/** "95°C" or "203°F" (whole degrees). Empty string for a missing/invalid value. */
export function formatTemperature(
  celsius: number | null | undefined,
  unit: TemperatureUnit = 'c',
): string {
  if (celsius == null || !Number.isFinite(celsius)) return ''
  return unit === 'f'
    ? `${Math.round(celsiusToFahrenheit(celsius))}°F`
    : `${Math.round(celsius)}°C`
}

/** "50 g" or "1.8 oz" (one decimal for ounces). Empty string for a missing/invalid value. */
export function formatWeight(grams: number | null | undefined, unit: WeightUnit = 'g'): string {
  if (grams == null || !Number.isFinite(grams)) return ''
  if (unit === 'oz') {
    const oz = Math.round(gramsToOunces(grams) * 10) / 10
    return `${oz} oz`
  }
  return `${Math.round(grams)} g`
}

/** Plain decimal (comma or dot); rejects exponents, hex, units and empty text. */
function parseNumber(text: string): number | null {
  const s = typeof text === 'string' ? text.trim().replace(',', '.') : ''
  if (!/^-?\d{1,9}(\.\d{1,6})?$/.test(s)) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/** Typed temperature in `unit` -> whole degrees Celsius, or null if not a number. */
export function parseTemperatureInput(text: string, unit: TemperatureUnit = 'c'): number | null {
  const n = parseNumber(text)
  if (n === null) return null
  const celsius = unit === 'f' ? fahrenheitToCelsius(n) : n
  // + 0 normalises -0 to 0.
  return Math.round(celsius) + 0
}

/** Typed weight in `unit` -> whole grams (never negative), or null if not a number. */
export function parseWeightInput(text: string, unit: WeightUnit = 'g'): number | null {
  const n = parseNumber(text)
  if (n === null || n < 0) return null
  const grams = unit === 'oz' ? ouncesToGrams(n) : n
  return Math.round(grams)
}
