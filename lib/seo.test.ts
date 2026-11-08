import { describe, it, expect } from 'vitest'
import { safeJsonLd, parseId, ratingFromScore } from './seo'

describe('safeJsonLd', () => {
  it('escapes < so </script> cannot break out', () => {
    const out = safeJsonLd({ name: '</script><script>alert(1)</script>' })
    expect(out).not.toContain('<')
    expect(out).toContain('\\u003c/script>')
    expect(JSON.parse(out).name).toBe('</script><script>alert(1)</script>')
  })
  it('escapes U+2028 and U+2029', () => {
    const out = safeJsonLd({ a: '\u2028\u2029' })
    expect(out).not.toMatch(/[\u2028\u2029]/)
    expect(JSON.parse(out).a).toBe('\u2028\u2029')
  })
})

describe('parseId', () => {
  it('accepts positive integers only', () => {
    expect(parseId('12')).toBe(12)
    expect(parseId('abc')).toBeNull()
    expect(parseId('1e3')).toBeNull()
    expect(parseId('-1')).toBeNull()
    expect(parseId('0')).toBeNull()
  })
})

describe('ratingFromScore', () => {
  it('clamps to 1..5 and handles null', () => {
    expect(ratingFromScore(null)).toBeNull()
    expect(ratingFromScore(0)).toBe(1)
    expect(ratingFromScore(500)).toBe(5)
    expect(ratingFromScore(82)).toBe(4.1)
  })
})
