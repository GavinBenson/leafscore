import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'drizzle-orm'
import { createTestDb } from '@/db/testDb'
import { rateLimits } from '@/db/schema'

let testDb: Awaited<ReturnType<typeof createTestDb>>
vi.mock('@/db/client', () => ({
  get db() {
    return testDb
  },
}))

import { GET } from './route'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/maintenance', { headers: auth ? { authorization: auth } : {} })

describe('cron maintenance', () => {
  beforeEach(async () => {
    testDb = await createTestDb()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(console, 'log').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.restoreAllMocks()
  })

  it('500s when CRON_SECRET is unset and 401s on a wrong bearer', async () => {
    expect((await GET(req('Bearer x'))).status).toBe(500)
    process.env.CRON_SECRET = 'right'
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
  })

  it('purges old rate-limit windows and reports the count', async () => {
    process.env.CRON_SECRET = 'right'
    await testDb.insert(rateLimits).values([
      { key: 'old', windowStart: sql`now() - interval '3 days'`, count: 1 },
      { key: 'fresh', windowStart: sql`now()`, count: 1 },
    ])
    const res = await GET(req('Bearer right'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ rateLimitsPurged: 1 })
    expect((await testDb.select().from(rateLimits)).map((r) => r.key)).toEqual(['fresh'])
  })
})
