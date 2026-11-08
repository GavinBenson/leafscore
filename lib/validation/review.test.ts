import { describe, expect, it } from 'vitest'
import { parseReviewForm } from './review'

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

const valid = { teaId: '3', score: '85' }

describe('parseReviewForm', () => {
  it('accepts a minimal review and normalises blanks to null', () => {
    const result = parseReviewForm(form({ ...valid, brewMethod: '', brewTemp: '', steepTime: '', notes: '  ' }))
    expect(result).toEqual({
      ok: true,
      data: {
        teaId: 3,
        score: 85,
        brewMethod: null,
        brewTemp: null,
        steepTime: null,
        notes: null,
        wouldDrinkAgain: null,
        tagIds: [],
        aromaScore: null,
        flavorScore: null,
        bodyScore: null,
        aftertasteScore: null,
        valueScore: null,
      },
    })
  })

  it.each(['aromaScore', 'flavorScore', 'bodyScore', 'aftertasteScore', 'valueScore'])(
    'validates the optional %s sub-score like the score',
    (field) => {
      const ok = parseReviewForm(form({ ...valid, [field]: '0' }))
      expect(ok.ok && ok.data[field as 'aromaScore']).toBe(0)
      const top = parseReviewForm(form({ ...valid, [field]: '100' }))
      expect(top.ok && top.data[field as 'aromaScore']).toBe(100)
      for (const bad of ['101', '-1', '1.5', 'abc']) {
        const result = parseReviewForm(form({ ...valid, [field]: bad }))
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.errors[field as 'aromaScore']).toBeTruthy()
      }
    },
  )

  it('accepts a full review, the score bounds and de-duplicates tags', () => {
    for (const score of ['0', '100']) {
      const result = parseReviewForm(form({
        ...valid,
        score,
        brewMethod: 'cold_brew',
        brewTemp: '100',
        steepTime: '86400',
        notes: ' Toasty ',
        wouldDrinkAgain: 'false',
        tagIds: '2,5,2',
      }))
      expect(result).toMatchObject({
        ok: true,
        data: { brewMethod: 'cold_brew', brewTemp: 100, steepTime: 86400, notes: 'Toasty', wouldDrinkAgain: false, tagIds: [2, 5] },
      })
    }
  })

  it('converts a Fahrenheit temperature to whole Celsius degrees', () => {
    const result = parseReviewForm(form({ ...valid, brewTemp: '203', brewTempUnit: 'f' }))
    expect(result).toMatchObject({ ok: true, data: { brewTemp: 95 } })
    expect(parseReviewForm(form({ ...valid, brewTemp: '32', brewTempUnit: 'f' }))).toMatchObject({ data: { brewTemp: 0 } })
    expect(parseReviewForm(form({ ...valid, brewTemp: '212', brewTempUnit: 'f' }))).toMatchObject({ data: { brewTemp: 100 } })
  })

  it('treats a missing or unknown unit as Celsius', () => {
    expect(parseReviewForm(form({ ...valid, brewTemp: '95' }))).toMatchObject({ data: { brewTemp: 95 } })
    expect(parseReviewForm(form({ ...valid, brewTemp: '95', brewTempUnit: 'kelvin' }))).toMatchObject({ data: { brewTemp: 95 } })
  })

  it.each(['213', '31', 'abc', '-40', '1e3'])('rejects Fahrenheit input %s', (brewTemp) => {
    const result = parseReviewForm(form({ ...valid, brewTemp, brewTempUnit: 'f' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveProperty('brewTemp')
  })

  it('reads the optional sub-scores and maps blanks to null', () => {
    const result = parseReviewForm(form({ ...valid, aromaScore: '90', valueScore: '0', flavorScore: '' }))
    expect(result).toMatchObject({
      ok: true,
      data: { aromaScore: 90, valueScore: 0, flavorScore: null, bodyScore: null, aftertasteScore: null },
    })
    for (const bad of ['101', '-1', '7.5', 'x']) {
      expect(parseReviewForm(form({ ...valid, bodyScore: bad }))).toMatchObject({ ok: false, errors: { bodyScore: expect.any(String) } })
    }
  })

  it.each([
    ['missing tea', { score: '85' }, 'teaId'],
    ['NaN tea', { teaId: 'abc', score: '85' }, 'teaId'],
    ['zero tea', { teaId: '0', score: '85' }, 'teaId'],
    ['missing score', { teaId: '3' }, 'score'],
    ['score above 100', { ...valid, score: '101' }, 'score'],
    ['negative score', { ...valid, score: '-1' }, 'score'],
    ['fractional score', { ...valid, score: '85.5' }, 'score'],
    ['unknown brew method', { ...valid, brewMethod: 'microwave' }, 'brewMethod'],
    ['temperature too high', { ...valid, brewTemp: '101' }, 'brewTemp'],
    ['negative temperature', { ...valid, brewTemp: '-5' }, 'brewTemp'],
    ['steep too long', { ...valid, steepTime: '86401' }, 'steepTime'],
    ['exponent steep', { ...valid, steepTime: '1e3' }, 'steepTime'],
    ['notes too long', { ...valid, notes: 'x'.repeat(5001) }, 'notes'],
    ['bad tag id', { ...valid, tagIds: '1,abc' }, 'tagIds'],
  ])('rejects %s', (_name, values, field) => {
    const result = parseReviewForm(form(values as Record<string, string>))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toHaveProperty(field)
  })
})
