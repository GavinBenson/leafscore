import { createHmac, timingSafeEqual } from 'node:crypto'
import { getAuthSecret } from '@/lib/env'

// Stateless signed token: `<userId>.<base64url HMAC-SHA256(userId:purpose)>`.
// The purpose is part of the signed message so a token minted for one use can't
// be replayed for another.
export const DIGEST_UNSUBSCRIBE_PURPOSE = 'digest-unsubscribe'

function sign(userId: number, purpose: string, secret: string): string {
  return createHmac('sha256', secret).update(`${userId}:${purpose}`).digest('base64url')
}

export function signToken(
  userId: number,
  purpose: string = DIGEST_UNSUBSCRIBE_PURPOSE,
  secret: string = getAuthSecret(),
): string {
  return `${userId}.${sign(userId, purpose, secret)}`
}

/** Returns the user id when the token is authentic for this purpose, else null. */
export function verifyToken(
  token: string | null | undefined,
  purpose: string = DIGEST_UNSUBSCRIBE_PURPOSE,
  secret: string = getAuthSecret(),
): number | null {
  if (!token || token.length > 200) return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const idPart = token.slice(0, dot)
  if (!/^\d+$/.test(idPart)) return null
  const userId = Number(idPart)
  if (!Number.isSafeInteger(userId) || userId < 1) return null
  const given = Buffer.from(token.slice(dot + 1))
  const expected = Buffer.from(sign(userId, purpose, secret))
  if (given.length !== expected.length) return null
  return timingSafeEqual(given, expected) ? userId : null
}
