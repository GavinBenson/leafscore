import { describe, expect, it } from 'vitest'
import { presentSubScores } from '@/components/SubScores'

describe('presentSubScores', () => {
  it('lists only the present values in a fixed order, keeping zero', () => {
    expect(presentSubScores({ valueScore: 0, aromaScore: 80, bodyScore: null })).toEqual([
      { field: 'aromaScore', label: 'Aroma', value: 80 },
      { field: 'valueScore', label: 'Value', value: 0 },
    ])
  })

  it('is empty when nothing was rated', () => {
    expect(presentSubScores({})).toEqual([])
  })
})
