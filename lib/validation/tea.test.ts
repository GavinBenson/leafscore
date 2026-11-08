import { describe, expect, it } from 'vitest'
import { parseTeaRequestStatus, validateHttpsUrl, validateTeaInput } from './tea'

describe('validateTeaInput', () => {
  const ok = { name: ' Dragonwell ', type: 'Green' }
  it('accepts and trims a minimal tea', () => {
    const r = validateTeaInput(ok)
    expect(r).toMatchObject({ ok: true, value: { name: 'Dragonwell', brandId: null, caffeineLevel: null } })
  })
  it('rejects bad names, types and enums', () => {
    expect(validateTeaInput({ ...ok, name: '  ' }).ok).toBe(false)
    expect(validateTeaInput({ ...ok, name: 'x'.repeat(201) }).ok).toBe(false)
    expect(validateTeaInput({ ...ok, type: 'Coffee' }).ok).toBe(false)
    expect(validateTeaInput({ ...ok, caffeineLevel: 'extreme' }).ok).toBe(false)
    expect(validateTeaInput({ ...ok, leafStyle: 'sack' }).ok).toBe(false)
  })
  it('validates brand ids', () => {
    expect(validateTeaInput({ ...ok, brandId: '12' })).toMatchObject({ ok: true, value: { brandId: 12 } })
    for (const bad of ['abc', '1.5', 'NaN', '-1', '1e99']) expect(validateTeaInput({ ...ok, brandId: bad }).ok).toBe(false)
  })
})

describe('parseTeaRequestStatus', () => {
  it('only allows known statuses', () => {
    expect(parseTeaRequestStatus('approved')).toBe('approved')
    expect(parseTeaRequestStatus('bogus')).toBeNull()
    expect(parseTeaRequestStatus(5)).toBeNull()
  })
})

describe('validateHttpsUrl', () => {
  it('requires https', () => {
    expect(validateHttpsUrl('')).toEqual({ ok: true, value: null })
    expect(validateHttpsUrl('https://a.com/x')).toMatchObject({ ok: true })
    expect(validateHttpsUrl('javascript:alert(1)').ok).toBe(false)
    expect(validateHttpsUrl('http://a.com').ok).toBe(false)
  })
})
