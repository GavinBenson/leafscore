import { describe, expect, it } from 'vitest'
import { resolveReturnTo } from './returnTo'

const BACKSLASH = String.fromCharCode(92)

describe('resolveReturnTo', () => {
  it('keeps same-site paths', () => {
    expect(resolveReturnTo('/journal', '/browse/1')).toBe('/journal')
    expect(resolveReturnTo('/journal?tab=favorites', '/x')).toBe('/journal?tab=favorites')
  })
  it('falls back for missing or unsafe values', () => {
    const bad = [undefined, null, '', 'https://evil.test', '//evil.test', `/${BACKSLASH}evil.test`, 'journal', 5]
    for (const value of bad) {
      expect(resolveReturnTo(value, '/browse/1')).toBe('/browse/1')
    }
  })
})
