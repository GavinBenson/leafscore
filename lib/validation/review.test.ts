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
      },
    })
  })

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
