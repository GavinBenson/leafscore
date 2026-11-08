import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createTestDb } from '@/db/testDb'

let testDb: Awaited<ReturnType<typeof createTestDb>>
const send = vi.fn(async () => {})
vi.mock('@/db/client', () => ({
  get db() {
    return testDb
  },
}))
vi.mock('@/lib/email/digest', () => ({ sendDigestEmail: () => send() }))

import { GET } from './route'

const req = (auth?: string) =>
  new Request('http://localhost/api/cron/digest', { headers: auth ? { authorization: auth } : {} })

describe('cron digest auth', () => {
  beforeEach(async () => {
    testDb = await createTestDb()
    send.mockClear()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    delete process.env.CRON_SECRET
    vi.restoreAllMocks()
  })

  it('500s and never runs when CRON_SECRET is unset', async () => {
    const res = await GET(req('Bearer anything'))
    expect(res.status).toBe(500)
    expect(send).not.toHaveBeenCalled()
  })
  it('401s on missing or wrong bearer', async () => {
    process.env.CRON_SECRET = 'right'
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer wrong'))).status).toBe(401)
    expect((await GET(req('right'))).status).toBe(401)
  })
  it('runs with the right secret (nothing to send on an empty db)', async () => {
    process.env.CRON_SECRET = 'right'
    const res = await GET(req('Bearer right'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sent: 0, failed: 0, skipped: 'no_content' })
  })
})
