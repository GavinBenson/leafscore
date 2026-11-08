import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createTestDb } from '@/db/testDb'
import { getUserById } from '@/lib/data/users'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number } | null,
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('@/lib/rateLimitGuard', () => ({ enforceRateLimit: async () => mocks.limit }))

const { savePreferences } = await import('./profile')
const { createTestDb: boot, seedTestUser } = await import('@/db/testDb')
const { isCommunityDataHidden } = await import('@/lib/blindTasting')
const { getViewerPreferences } = await import('@/lib/viewerPreferences')
const { seedTestTea } = await import('@/db/testDb')
const { createReview } = await import('@/lib/data/reviews')

const idle = { status: 'idle' as const }
function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [key, value] of Object.entries(values)) fd.set(key, value)
  return fd
}

describe('savePreferences', () => {
  let userId: number

  beforeEach(async () => {
    mocks.db = await boot()
    mocks.limit = { ok: true }
    userId = (await seedTestUser(mocks.db)).id
    mocks.user = { id: userId }
  })

  it('saves valid preferences', async () => {
    const state = await savePreferences(idle, form({ tempUnit: 'f', weightUnit: 'oz', blindTasting: 'on' }))
    expect(state.status).toBe('saved')
    expect(await getUserById(mocks.db, userId)).toMatchObject({ tempUnit: 'f', weightUnit: 'oz', blindTasting: true })
  })

  it('turns blind tasting off when the checkbox is absent', async () => {
    await savePreferences(idle, form({ tempUnit: 'c', weightUnit: 'g', blindTasting: 'on' }))
    await savePreferences(idle, form({ tempUnit: 'c', weightUnit: 'g' }))
    expect((await getUserById(mocks.db, userId))?.blindTasting).toBe(false)
  })

  it('rejects invalid values and changes nothing', async () => {
    const state = await savePreferences(idle, form({ tempUnit: 'k', weightUnit: 'g' }))
    expect(state.status).toBe('error')
    expect(state.message).toBeTruthy()
    expect(await getUserById(mocks.db, userId)).toMatchObject({ tempUnit: 'c', weightUnit: 'g', blindTasting: false })
  })

  it('needs a signed-in user', async () => {
    mocks.user = null
    const state = await savePreferences(idle, form({ tempUnit: 'f', weightUnit: 'g' }))
    expect(state.status).toBe('error')
    expect((await getUserById(mocks.db, userId))?.tempUnit).toBe('c')
  })

  it('is rate limited', async () => {
    mocks.limit = { ok: false, message: 'Too many requests.', retryAfterSeconds: 30 }
    const state = await savePreferences(idle, form({ tempUnit: 'f', weightUnit: 'g' }))
    expect(state).toMatchObject({ status: 'error', message: 'Too many requests.' })
    expect((await getUserById(mocks.db, userId))?.tempUnit).toBe('c')
  })

  it('blocks banned users', async () => {
    const { banUser } = await import('@/lib/data/users')
    await banUser(mocks.db, userId)
    const state = await savePreferences(idle, form({ tempUnit: 'f', weightUnit: 'g' }))
    expect(state.status).toBe('error')
    expect((await getUserById(mocks.db, userId))?.tempUnit).toBe('c')
  })
})

describe('viewer preferences and the blind check', () => {
  it('defaults for signed-out and unknown users, and hides until reviewed', async () => {
    const db = await boot()
    expect(await getViewerPreferences(db, null)).toEqual({ tempUnit: 'c', weightUnit: 'g', blindTasting: false })
    const user = await seedTestUser(db)
    const tea = await seedTestTea(db)
    expect(await isCommunityDataHidden(db, user.id, tea.id)).toBe(false)
    const { updateUserPreferences } = await import('@/lib/data/users')
    await updateUserPreferences(db, user.id, { blindTasting: true, tempUnit: 'f' })
    expect((await getViewerPreferences(db, user.id)).tempUnit).toBe('f')
    expect(await isCommunityDataHidden(db, null, tea.id)).toBe(false)
    expect(await isCommunityDataHidden(db, user.id, tea.id)).toBe(true)
    await createReview(db, { userId: user.id, teaId: tea.id, score: 70 })
    expect(await isCommunityDataHidden(db, user.id, tea.id)).toBe(false)
  })
})
