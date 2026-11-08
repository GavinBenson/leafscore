import { describe, expect, it } from 'vitest'
import { compareHref, parseCompareIds, parseStoredTray, toggleCompareId } from './compareIds'

describe('parseCompareIds', () => {
  it('parses, dedupes and keeps order', () => {
    expect(parseCompareIds('3,1,3,2')).toEqual({ ids: [3, 1, 2], invalid: 0, overflow: 0 })
  })
  it('counts invalid entries and overflow', () => {
    expect(parseCompareIds('1,abc,2.5,-1,0,1e3,2,3,4,5')).toEqual({ ids: [1, 2, 3], invalid: 5, overflow: 2 })
  })
  it('handles missing, empty and array input', () => {
    expect(parseCompareIds(undefined).ids).toEqual([])
    expect(parseCompareIds('').ids).toEqual([])
    expect(parseCompareIds(',,').ids).toEqual([])
    expect(parseCompareIds(['1,2', '3']).ids).toEqual([1, 2, 3])
  })
  it('rejects unsafe integers', () => {
    expect(parseCompareIds('99999999999999999999').invalid).toBe(1)
  })
})

describe('tray helpers', () => {
  it('toggles with a cap of 3', () => {
    let r = toggleCompareId([], 1)
    expect(r).toEqual({ tray: [1], changed: 'added' })
    r = toggleCompareId([1, 2, 3], 4)
    expect(r).toEqual({ tray: [1, 2, 3], changed: 'full' })
    r = toggleCompareId([1, 2, 3], 2)
    expect(r).toEqual({ tray: [1, 3], changed: 'removed' })
  })
  it('parses stored values defensively', () => {
    expect(parseStoredTray('[1,"2",3,4]')).toEqual([1, 2, 3])
    expect(parseStoredTray('nope')).toEqual([])
    expect(parseStoredTray('{"a":1}')).toEqual([])
    expect(parseStoredTray(null)).toEqual([])
    expect(parseStoredTray('[null,{},1.5,2]')).toEqual([2])
  })
  it('builds the href', () => {
    expect(compareHref([1, 2])).toBe('/compare?ids=1,2')
  })
})
