import { describe, expect, it } from 'vitest'
import { safeCallbackUrl, signInPath } from './authRedirect'

describe('safeCallbackUrl', () => {
  it('keeps same-site relative paths', () => {
    expect(safeCallbackUrl('/journal')).toBe('/journal')
    expect(safeCallbackUrl('/log?tea=12')).toBe('/log?tea=12')
  })

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeCallbackUrl('https://evil.example')).toBe('/')
    expect(safeCallbackUrl('//evil.example')).toBe('/')
    expect(safeCallbackUrl('/\\evil.example')).toBe('/')
    expect(safeCallbackUrl('javascript:alert(1)')).toBe('/')
  })

  it('falls back to home for missing values', () => {
    expect(safeCallbackUrl(undefined)).toBe('/')
    expect(safeCallbackUrl(null)).toBe('/')
  })
})

describe('signInPath', () => {
  it('encodes the callback URL', () => {
    expect(signInPath('/log?tea=12')).toBe('/signin?callbackUrl=%2Flog%3Ftea%3D12')
  })
})
