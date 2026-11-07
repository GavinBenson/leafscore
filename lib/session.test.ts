import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/auth', () => ({ auth: authMock }))

const { getCurrentUser } = await import('./session')

describe('getCurrentUser', () => {
  beforeEach(() => authMock.mockReset())

  it('is null when signed out', async () => {
    authMock.mockResolvedValue(null)
    expect(await getCurrentUser()).toBeNull()
  })

  it('is null when the session has no matching user row', async () => {
    authMock.mockResolvedValue({ user: { email: 'gone@example.com' } })
    expect(await getCurrentUser()).toBeNull()
  })

  it('returns the user, defaulting missing flags to false', async () => {
    authMock.mockResolvedValue({ user: { id: '7', email: 'a@example.com', name: 'A' } })
    expect(await getCurrentUser()).toEqual({
      id: 7,
      email: 'a@example.com',
      name: 'A',
      image: null,
      isPremium: false,
      isAdmin: false,
    })
  })
})
