import { beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, seedTestTea } from '@/db/testDb'
import * as schema from '@/db/schema'

let testDb: Awaited<ReturnType<typeof createTestDb>>
vi.mock('@/db/client', () => ({
  get db() {
    return testDb
  },
}))
vi.mock('next/headers', () => ({
  headers: async () => ({ get: (k: string) => (k === 'x-forwarded-for' ? '5.5.5.5' : null) }),
}))

import { GET } from './route'

const call = (id: string) =>
  GET(new Request('http://localhost/api/out/' + id), { params: Promise.resolve({ id }) })

describe('/api/out/[id]', () => {
  let linkId: number
  let teaId: number
  beforeEach(async () => {
    testDb = await createTestDb()
    const tea = await seedTestTea(testDb)
    teaId = tea.id
    const [l] = await testDb
      .insert(schema.affiliateLinks)
      .values({ teaId, provider: 'S', url: 'https://shop.example/t' })
      .returning()
    linkId = l.id
  })

  it('302s to the stored url and counts the click', async () => {
    const res = await call(String(linkId))
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://shop.example/t')
    const [row] = await testDb.select().from(schema.affiliateLinks).where(eq(schema.affiliateLinks.id, linkId))
    expect(row.clickCount).toBe(1)
  })
  it('404s for bad ids and unknown links', async () => {
    expect((await call('abc')).status).toBe(404)
    expect((await call('999')).status).toBe(404)
  })
  it('never redirects to a non-https stored url', async () => {
    const [b] = await testDb
      .insert(schema.affiliateLinks)
      .values({ teaId, provider: 'B', url: 'http://evil.example' })
      .returning()
    const res = await call(String(b.id))
    expect(res.status).toBe(404)
    expect(res.headers.get('location')).toBeNull()
  })
  it('rate limits per IP', async () => {
    let last = 0
    for (let i = 0; i < 31; i++) last = (await call(String(linkId))).status
    expect(last).toBe(429)
  })
})
