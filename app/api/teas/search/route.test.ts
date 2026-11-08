import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
  search: vi.fn(async (...args: unknown[]) => { void args; return [{ id: 1, name: 'Sencha' }] }),
  enforce: vi.fn(),
}))
vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/data/teas', () => ({ searchTeas: mocks.search }))
vi.mock('@/lib/rateLimitGuard', () => ({
  enforceRateLimit: async (...args: unknown[]) => {
    mocks.enforce(...args)
    return mocks.limit
  },
}))

const { GET } = await import('./route')

function get(q?: string) {
  const url = new URL('http://localhost/api/teas/search')
  if (q !== undefined) url.searchParams.set('q', q)
  const req = new Request(url) as unknown as import('next/server').NextRequest
  Object.defineProperty(req, 'nextUrl', { value: url })
  return req
}

describe('GET /api/teas/search', () => {
  beforeEach(() => {
    mocks.limit = { ok: true }
    mocks.search.mockClear()
    mocks.enforce.mockClear()
  })

  it('returns [] for a missing, blank or one-character q without hitting the db or limiter', async () => {
    for (const q of [undefined, '', '   ', 'a']) {
      const res = await GET(get(q))
      expect(await res.json()).toEqual([])
    }
    expect(mocks.search).not.toHaveBeenCalled()
    expect(mocks.enforce).not.toHaveBeenCalled()
  })

  it('caps q at 100 characters', async () => {
    await GET(get('x'.repeat(500)))
    expect((mocks.search.mock.calls[0][1] as string).length).toBe(100)
  })

  it('returns 429 with Retry-After once limited', async () => {
    mocks.limit = { ok: false, message: 'Too many requests.', retryAfterSeconds: 42 }
    const res = await GET(get('sencha'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(mocks.search).not.toHaveBeenCalled()
  })

  it('returns results when allowed and 500 on a search failure', async () => {
    expect(await (await GET(get('sencha'))).json()).toEqual([{ id: 1, name: 'Sencha' }])
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.search.mockRejectedValueOnce(new Error('db down'))
    expect((await GET(get('sencha'))).status).toBe(500)
  })
})
