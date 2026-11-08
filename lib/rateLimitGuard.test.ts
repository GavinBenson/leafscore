import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/db/testDb'

let testDb: Awaited<ReturnType<typeof createTestDb>>
let headerMap: Record<string, string> = {}

vi.mock('@/db/client', () => ({
  get db() {
    return testDb
  },
}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => headerMap[k.toLowerCase()] ?? null }),
}))

import { enforceRateLimit, UNKNOWN_IP_LIMIT_MULTIPLIER } from './rateLimitGuard'
import { rateLimits } from '@/db/schema'

describe('enforceRateLimit', () => {
  beforeEach(async () => {
    testDb = await createTestDb()
    headerMap = {}
  })

  it('blocks per client IP using the first x-forwarded-for hop', async () => {
    headerMap = { 'x-forwarded-for': '1.1.1.1, 9.9.9.9' }
    expect(await enforceRateLimit('t', { limit: 2, windowSeconds: 60 })).toEqual({ ok: true })
    expect(await enforceRateLimit('t', { limit: 2, windowSeconds: 60 })).toEqual({ ok: true })
    const blocked = await enforceRateLimit('t', { limit: 2, windowSeconds: 60 })
    expect(blocked).toMatchObject({ ok: false, message: expect.stringContaining('wait') })
    expect(blocked.ok === false && blocked.retryAfterSeconds).toBeGreaterThan(0)

    headerMap = { 'x-forwarded-for': '2.2.2.2' }
    expect(await enforceRateLimit('t', { limit: 2, windowSeconds: 60 })).toEqual({ ok: true })
  })

  it('falls back to x-real-ip, then unknown', async () => {
    headerMap = { 'x-real-ip': '3.3.3.3' }
    await enforceRateLimit('s', { limit: 1, windowSeconds: 60 })
    expect((await enforceRateLimit('s', { limit: 1, windowSeconds: 60 })).ok).toBe(false)
    headerMap = {}
    // Unknown clients share one bucket, so its limit is multiplied (not 1).
    for (let i = 0; i < UNKNOWN_IP_LIMIT_MULTIPLIER; i++) {
      expect((await enforceRateLimit('s', { limit: 1, windowSeconds: 60 })).ok).toBe(true)
    }
    expect((await enforceRateLimit('s', { limit: 1, windowSeconds: 60 })).ok).toBe(false)
  })

  it('prefers the platform header over x-real-ip and x-forwarded-for', async () => {
    headerMap = { 'x-vercel-forwarded-for': '4.4.4.4', 'x-real-ip': '5.5.5.5', 'x-forwarded-for': '6.6.6.6' }
    await enforceRateLimit('p', { limit: 1, windowSeconds: 60 })
    headerMap = { 'x-vercel-forwarded-for': '4.4.4.4', 'x-forwarded-for': '7.7.7.7' }
    expect((await enforceRateLimit('p', { limit: 1, windowSeconds: 60 })).ok).toBe(false)
    const keys = (await testDb.select().from(rateLimits)).map((r) => r.key)
    expect(keys).toEqual(['p:ip:4.4.4.4'])
  })

  it('hashes email identifiers and can key on email plus IP', async () => {
    headerMap = { 'x-real-ip': '1.1.1.1' }
    await enforceRateLimit('e', { limit: 1, windowSeconds: 60, userId: 'victim@example.com', withIp: true })
    const keys = (await testDb.select().from(rateLimits)).map((r) => r.key)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toContain('victim')
    expect(keys[0]).toMatch(/^e:h:[0-9a-f]{32}:ip:1.1.1.1$/)
    // An attacker on another IP cannot exhaust the victim's allowance from 1.1.1.1.
    expect((await enforceRateLimit('e', { limit: 1, windowSeconds: 60, userId: 'victim@example.com', withIp: true })).ok).toBe(false)
    headerMap = { 'x-real-ip': '2.2.2.2' }
    expect((await enforceRateLimit('e', { limit: 1, windowSeconds: 60, userId: 'victim@example.com', withIp: true })).ok).toBe(true)
  })

  it('keys by user id when given, independent of IP', async () => {
    headerMap = { 'x-forwarded-for': '1.1.1.1' }
    await enforceRateLimit('u', { limit: 1, windowSeconds: 60, userId: 7 })
    expect((await enforceRateLimit('u', { limit: 1, windowSeconds: 60, userId: 7 })).ok).toBe(false)
    expect((await enforceRateLimit('u', { limit: 1, windowSeconds: 60, userId: 8 })).ok).toBe(true)
  })

  it('fails open when the limiter errors', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await (testDb as unknown as { $client: { close(): Promise<void> } }).$client.close()
    expect(await enforceRateLimit('x', { limit: 1, windowSeconds: 60 })).toEqual({ ok: true })
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})
