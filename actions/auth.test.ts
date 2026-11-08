import { beforeEach, describe, expect, it, vi } from 'vitest'

const signInMock = vi.fn()
const enforce = vi.fn()
vi.mock('@/lib/auth', () => ({ signIn: (...a: unknown[]) => signInMock(...a), signOut: vi.fn() }))
vi.mock('@/lib/rateLimitGuard', () => ({ enforceRateLimit: (...a: unknown[]) => enforce(...a) }))
vi.mock('next-auth', () => ({
  AuthError: class AuthError extends Error {
    type = 'AuthError'
  },
}))
vi.mock('@/lib/observability', () => ({ captureError: vi.fn() }))

import { AuthError } from 'next-auth'
import { signInWithEmail } from './auth'

class AccessDenied extends AuthError {
  type = 'AccessDenied' as never
}

const form = (email: string) => {
  const f = new FormData()
  f.set('email', email)
  return f
}
const idle = { status: 'idle' as const }

describe('signInWithEmail', () => {
  beforeEach(() => {
    signInMock.mockReset()
    enforce.mockReset()
    enforce.mockResolvedValue({ ok: true })
  })

  it('shows the normal sent state for a banned email (AccessDenied redirect)', async () => {
    signInMock.mockResolvedValue('http://localhost/api/auth/error?error=AccessDenied')
    expect(await signInWithEmail(idle, form('Banned@x.com'))).toEqual({ status: 'sent', email: 'banned@x.com' })
  })

  it('shows the normal sent state when AccessDenied is thrown', async () => {
    signInMock.mockRejectedValue(new AccessDenied())
    expect(await signInWithEmail(idle, form('banned@x.com'))).toEqual({ status: 'sent', email: 'banned@x.com' })
  })

  it('still reports other failures as errors', async () => {
    signInMock.mockResolvedValue('http://localhost/api/auth/error?error=EmailSignin')
    expect((await signInWithEmail(idle, form('a@x.com'))).status).toBe('error')
  })

  it('keys the per-email limit on email and IP, plus a higher global ceiling', async () => {
    signInMock.mockResolvedValue('http://localhost/ok')
    await signInWithEmail(idle, form('a@x.com'))
    expect(enforce).toHaveBeenCalledWith('magic-email', expect.objectContaining({ limit: 5, userId: 'a@x.com', withIp: true }))
    expect(enforce).toHaveBeenCalledWith('magic-email-global', expect.objectContaining({ limit: 30, userId: 'a@x.com' }))
    expect(enforce).toHaveBeenCalledWith('magic-ip', expect.objectContaining({ limit: 20 }))
  })

  it('does not send when the global ceiling is hit, but still looks sent', async () => {
    enforce.mockImplementation(async (scope: string) =>
      scope === 'magic-email-global' ? { ok: false, message: 'x', retryAfterSeconds: 5 } : { ok: true })
    expect(await signInWithEmail(idle, form('a@x.com'))).toEqual({ status: 'sent', email: 'a@x.com' })
    expect(signInMock).not.toHaveBeenCalled()
  })
})
