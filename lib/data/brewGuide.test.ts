import { beforeEach, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import * as schema from '@/db/schema'
import { createTestDb } from '@/db/testDb'
import { addReview, addTea, type TestDb } from './testKit'
import {
  brewMethodLabel,
  formatSteepTime,
  getBrewGuide,
  brewGuideSummary,
  hasBrewGuideData,
  type BrewGuide,
} from './brewGuide'

describe('getBrewGuide', () => {
  let db: TestDb
  let teaId: number

  beforeEach(async () => {
    db = await createTestDb()
    teaId = (await addTea(db)).id
  })

  it('is empty for a tea without reviews or with all-null brew data', async () => {
    expect(await getBrewGuide(db, teaId)).toEqual({ temperature: null, time: null, method: null })
    for (let i = 0; i < 5; i++) await addReview(db, teaId)
    const guide = await getBrewGuide(db, teaId)
    expect(guide).toEqual({ temperature: null, time: null, method: null })
    expect(hasBrewGuideData(guide)).toBe(false)
  })

  it('needs 3 reviews with the field, per field', async () => {
    await addReview(db, teaId, { brewTemp: 90, steepTime: 60 })
    await addReview(db, teaId, { brewTemp: 95, steepTime: 90 })
    let guide = await getBrewGuide(db, teaId)
    expect(guide.temperature).toBeNull()
    expect(guide.time).toBeNull()
    await addReview(db, teaId, { brewTemp: 95 })
    guide = await getBrewGuide(db, teaId)
    expect(guide.temperature?.count).toBe(3)
    expect(guide.time).toBeNull()
  })

  it('computes median and interquartile range, ignoring nulls', async () => {
    for (const t of [80, 85, 90, 95, 100]) await addReview(db, teaId, { brewTemp: t, steepTime: t * 2 })
    await addReview(db, teaId) // null brew data does not count
    const guide = await getBrewGuide(db, teaId)
    expect(guide.temperature).toEqual({ median: 90, q1: 85, q3: 95, count: 5 })
    expect(guide.time).toEqual({ median: 180, q1: 170, q3: 190, count: 5 })
  })

  it('interpolates an even count and rounds to whole numbers', async () => {
    for (const t of [90, 91, 95, 96]) await addReview(db, teaId, { brewTemp: t })
    const { temperature } = await getBrewGuide(db, teaId)
    expect(temperature?.median).toBe(93) // 93 exactly
    expect(temperature?.q1).toBe(91) // 90.75 -> 91
    expect(temperature?.q3).toBe(95) // 95.25 -> 95
  })

  it('is robust to outliers (median barely moves)', async () => {
    for (const t of [90, 92, 93, 95, 96, 97]) await addReview(db, teaId, { brewTemp: t })
    const before = await getBrewGuide(db, teaId)
    await addReview(db, teaId, { brewTemp: 1 })
    await addReview(db, teaId, { brewTemp: 100 })
    const after = await getBrewGuide(db, teaId)
    expect(Math.abs((after.temperature?.median ?? 0) - (before.temperature?.median ?? 0))).toBeLessThanOrEqual(2)
  })

  it('treats zero as missing', async () => {
    for (const t of [0, 0, 0, 95, 95]) await addReview(db, teaId, { brewTemp: t })
    expect((await getBrewGuide(db, teaId)).temperature).toBeNull()
  })

  it('picks the most common method with its share, ties broken by name', async () => {
    await addReview(db, teaId, { brewMethod: 'western' })
    await addReview(db, teaId, { brewMethod: 'gongfu' })
    await addReview(db, teaId, { brewMethod: 'gongfu' })
    await addReview(db, teaId, { brewMethod: 'western' })
    await addReview(db, teaId, { brewMethod: 'cold_brew' })
    await addReview(db, teaId)
    const guide = await getBrewGuide(db, teaId)
    expect(guide.method).toEqual({ method: 'gongfu', count: 2, share: 0.4, total: 5 })
  })

  it('hides the method with fewer than 3 reviews that have one', async () => {
    await addReview(db, teaId, { brewMethod: 'gongfu' })
    await addReview(db, teaId, { brewMethod: 'gongfu' })
    expect((await getBrewGuide(db, teaId)).method).toBeNull()
  })

  it('excludes hidden reviews everywhere', async () => {
    for (const t of [90, 90, 90]) await addReview(db, teaId, { brewTemp: t, brewMethod: 'gongfu' })
    const hidden = await addReview(db, teaId, { brewTemp: 10, brewMethod: 'western' })
    const hidden2 = await addReview(db, teaId, { brewTemp: 10, brewMethod: 'western' })
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden.id))
    await db.update(schema.reviews).set({ hidden: true }).where(eq(schema.reviews.id, hidden2.id))
    const guide = await getBrewGuide(db, teaId)
    expect(guide.temperature).toEqual({ median: 90, q1: 90, q3: 90, count: 3 })
    expect(guide.method).toMatchObject({ method: 'gongfu', share: 1, total: 3 })
  })

  it('does not mix teas', async () => {
    const other = (await addTea(db, { name: 'Other' })).id
    for (const t of [70, 70, 70]) await addReview(db, other, { brewTemp: t })
    for (const t of [95, 95, 95]) await addReview(db, teaId, { brewTemp: t })
    expect((await getBrewGuide(db, teaId)).temperature?.median).toBe(95)
  })
})

describe('formatting helpers', () => {
  it('formats steep times', () => {
    expect(formatSteepTime(45)).toBe('45 s')
    expect(formatSteepTime(180)).toBe('3 min')
    expect(formatSteepTime(210)).toBe('3 min 30 s')
    expect(formatSteepTime(28800)).toBe('8 h')
    expect(formatSteepTime(5400)).toBe('1 h 30 min')
  })
  it('labels methods', () => {
    expect(brewMethodLabel('cold_brew')).toBe('cold brew')
    expect(brewMethodLabel('gongfu')).toBe('gongfu')
    expect(brewMethodLabel('some_new')).toBe('some new')
  })
  it('detects data', () => {
    const g: BrewGuide = { temperature: null, time: null, method: { method: 'gongfu', count: 3, share: 1, total: 3 } }
    expect(hasBrewGuideData(g)).toBe(true)
  })
})

describe('brewGuideSummary', () => {
  const range = (median: number, count = 12) => ({ median, q1: median - 2, q3: median + 2, count })
  it('summarises temperature, time, method and count', () => {
    const g: BrewGuide = {
      temperature: range(95),
      time: range(180, 9),
      method: { method: 'gongfu', count: 8, share: 0.66, total: 12 },
    }
    expect(brewGuideSummary(g)).toBe('Most drinkers brew this at 95°C for 3 min · gongfu · based on 12 reviews')
    expect(brewGuideSummary(g, 'f')).toContain('203°F')
  })
  it('handles partial data and empty', () => {
    expect(brewGuideSummary({ temperature: null, time: range(60, 3), method: null })).toBe(
      'Most drinkers brew this for 1 min · based on 3 reviews',
    )
    expect(
      brewGuideSummary({ temperature: null, time: null, method: { method: 'cold_brew', count: 3, share: 1, total: 3 } }),
    ).toBe('Most drinkers brew this cold brew · based on 3 reviews')
    expect(brewGuideSummary({ temperature: null, time: null, method: null })).toBeNull()
  })
})
