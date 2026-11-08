import { describe, expect, it } from 'vitest'
import { clampPage, parseId } from './ids'
import { safeHttpUrl } from './safeUrl'

describe('parseId', () => {
  it('accepts positive safe integers only', () => {
    expect(parseId('42')).toBe(42)
    for (const bad of ['abc', '1.5', '0', '-3', '1e99', '', ' 4', '99999999999999999999', undefined]) {
      expect(parseId(bad)).toBeNull()
    }
  })
})

describe('clampPage', () => {
  it('clamps to a valid range', () => {
    expect(clampPage('3')).toBe(3)
    expect(clampPage('1.3')).toBe(1)
    expect(clampPage('0')).toBe(1)
    expect(clampPage('1e20')).toBe(1)
    expect(clampPage('999999')).toBe(1000)
    expect(clampPage(undefined)).toBe(1)
  })
})

describe('safeHttpUrl', () => {
  it('blocks non-https schemes', () => {
    expect(safeHttpUrl('https://example.com')).toBe('https://example.com/')
    expect(safeHttpUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpUrl('data:text/html,x')).toBeNull()
    expect(safeHttpUrl('http://example.com')).toBeNull()
    expect(safeHttpUrl('http://example.com', { allowHttp: true })).not.toBeNull()
    expect(safeHttpUrl(null)).toBeNull()
  })
})
