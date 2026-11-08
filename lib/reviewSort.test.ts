import { describe, expect, it } from 'vitest'
import { parseReviewSort, teaReviewsHref } from './reviewSort'

describe('parseReviewSort', () => {
  it('accepts the known values', () => {
    expect(parseReviewSort('helpful')).toBe('helpful')
    expect(parseReviewSort('recent')).toBe('recent')
    expect(parseReviewSort(['helpful', 'recent'])).toBe('helpful')
  })
  it('falls back to recent for anything else', () => {
    expect(parseReviewSort(undefined)).toBe('recent')
    expect(parseReviewSort('')).toBe('recent')
    expect(parseReviewSort('HELPFUL')).toBe('recent')
    expect(parseReviewSort('score desc; drop table')).toBe('recent')
    expect(parseReviewSort([])).toBe('recent')
  })
})

describe('teaReviewsHref', () => {
  it('omits defaults and keeps the sort across pages', () => {
    expect(teaReviewsHref(5)).toBe('/browse/5')
    expect(teaReviewsHref(5, 3)).toBe('/browse/5?rpage=3')
    expect(teaReviewsHref(5, 1, 'helpful')).toBe('/browse/5?rsort=helpful')
    expect(teaReviewsHref(5, 2, 'helpful')).toBe('/browse/5?rsort=helpful&rpage=2')
  })
})
