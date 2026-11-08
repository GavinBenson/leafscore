import { describe, expect, it } from 'vitest'
import {
  celsiusToFahrenheit,
  fahrenheitToCelsius,
  formatTemperature,
  formatWeight,
  gramsToOunces,
  isTemperatureUnit,
  isWeightUnit,
  ouncesToGrams,
  parseTemperatureInput,
  parseWeightInput,
} from './units'

describe('conversions', () => {
  it('converts known points', () => {
    expect(celsiusToFahrenheit(0)).toBe(32)
    expect(celsiusToFahrenheit(100)).toBe(212)
    expect(fahrenheitToCelsius(212)).toBe(100)
    expect(fahrenheitToCelsius(32)).toBe(0)
    expect(fahrenheitToCelsius(-40)).toBe(-40)
    expect(gramsToOunces(28.349523125)).toBeCloseTo(1, 10)
    expect(ouncesToGrams(1)).toBeCloseTo(28.3495, 4)
  })

  it('round-trips every whole Celsius value in the review range', () => {
    for (let c = 0; c <= 100; c++) {
      const f = Math.round(celsiusToFahrenheit(c))
      expect(Math.round(fahrenheitToCelsius(f))).toBe(c)
      expect(parseTemperatureInput(String(f), 'f')).toBe(c)
    }
  })

  it('round-trips grams through ounces', () => {
    for (const g of [0, 1, 5, 25, 50, 100, 357, 1000]) {
      expect(ouncesToGrams(gramsToOunces(g))).toBeCloseTo(g, 8)
    }
  })
})

describe('formatting', () => {
  it('formats temperature in each unit', () => {
    expect(formatTemperature(95, 'c')).toBe('95°C')
    expect(formatTemperature(95, 'f')).toBe('203°F')
    expect(formatTemperature(0, 'f')).toBe('32°F')
    expect(formatTemperature(100, 'f')).toBe('212°F')
    expect(formatTemperature(95)).toBe('95°C')
  })
  it('formats weight in each unit', () => {
    expect(formatWeight(50, 'g')).toBe('50 g')
    expect(formatWeight(50, 'oz')).toBe('1.8 oz')
    expect(formatWeight(0, 'oz')).toBe('0 oz')
  })
  it('returns an empty string for missing values', () => {
    expect(formatTemperature(null, 'c')).toBe('')
    expect(formatTemperature(undefined, 'f')).toBe('')
    expect(formatTemperature(Number.NaN, 'c')).toBe('')
    expect(formatWeight(null, 'g')).toBe('')
    expect(formatWeight(Number.POSITIVE_INFINITY, 'oz')).toBe('')
  })
})

describe('parseTemperatureInput', () => {
  it('parses Celsius and rounds to whole degrees', () => {
    expect(parseTemperatureInput('95', 'c')).toBe(95)
    expect(parseTemperatureInput(' 95.4 ', 'c')).toBe(95)
    expect(parseTemperatureInput('95,6', 'c')).toBe(96)
    expect(parseTemperatureInput('0', 'c')).toBe(0)
    expect(Object.is(parseTemperatureInput('-0.2', 'c'), 0)).toBe(true)
  })
  it('parses Fahrenheit to Celsius', () => {
    expect(parseTemperatureInput('212', 'f')).toBe(100)
    expect(parseTemperatureInput('32', 'f')).toBe(0)
    expect(parseTemperatureInput('176', 'f')).toBe(80)
    expect(parseTemperatureInput('203', 'f')).toBe(95)
  })
  it('rejects bad input', () => {
    for (const bad of ['', '  ', 'abc', '9 5', '1e3', '0x10', '95C', '--5', '5.', '.5', 'NaN', 'Infinity', '1234567890123']) {
      expect(parseTemperatureInput(bad, 'c'), bad).toBeNull()
    }
    expect(parseTemperatureInput(undefined as unknown as string, 'c')).toBeNull()
  })
})

describe('parseWeightInput', () => {
  it('parses grams and ounces to whole grams', () => {
    expect(parseWeightInput('50', 'g')).toBe(50)
    expect(parseWeightInput('12.6', 'g')).toBe(13)
    expect(parseWeightInput('1', 'oz')).toBe(28)
    expect(parseWeightInput('1.8', 'oz')).toBe(51)
    expect(parseWeightInput('0', 'oz')).toBe(0)
  })
  it('rejects negative and malformed input', () => {
    for (const bad of ['', 'x', '-1', '1e2', '3 oz', '1..2']) {
      expect(parseWeightInput(bad, 'g'), bad).toBeNull()
    }
  })
})

describe('unit guards', () => {
  it('accepts only known units', () => {
    expect(isTemperatureUnit('c')).toBe(true)
    expect(isTemperatureUnit('k')).toBe(false)
    expect(isWeightUnit('oz')).toBe(true)
    expect(isWeightUnit('lb')).toBe(false)
  })
})
