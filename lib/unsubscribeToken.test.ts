import { describe, expect, it } from 'vitest'
import { signToken, verifyToken } from './unsubscribeToken'

const S = 'secret-a'

describe('unsubscribe token', () => {
  it('round-trips', () => {
    expect(verifyToken(signToken(42, 'digest-unsubscribe', S), 'digest-unsubscribe', S)).toBe(42)
  })
  it('rejects tampering, wrong purpose, wrong secret and junk', () => {
    const t = signToken(42, 'digest-unsubscribe', S)
    expect(verifyToken(t.replace(/^42/, '43'), 'digest-unsubscribe', S)).toBeNull()
    expect(verifyToken(t.slice(0, -2) + 'xx', 'digest-unsubscribe', S)).toBeNull()
    expect(verifyToken(t, 'other', S)).toBeNull()
    expect(verifyToken(t, 'digest-unsubscribe', 'secret-b')).toBeNull()
    for (const junk of [null, undefined, '', '42', '42.', '.abc', 'x.y', '0.abc', '1e3.abc']) {
      expect(verifyToken(junk, 'digest-unsubscribe', S)).toBeNull()
    }
  })
})
