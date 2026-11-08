import { beforeEach, describe, expect, it, vi } from 'vitest'
import { revalidatePath, updateTag } from 'next/cache'
import type { createTestDb } from '@/db/testDb'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number } | null,
}))

vi.mock('@/db/client', () => ({
  get db() {
    return mocks.db
  },
}))
vi.mock('@/lib/session', () => ({ getCurrentUser: async () => mocks.user }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

const { updateProfileVisibility } = await import('./profile')
const { createTestDb: boot, seedTestUser } = await import('@/db/testDb')

describe('profile privacy toggle cache invalidation', () => {
  beforeEach(async () => {
    mocks.db = await boot()
    mocks.user = { id: (await seedTestUser(mocks.db)).id }
    vi.mocked(updateTag).mockClear()
  })

  it('invalidates the profile and review-author caches, and the profile path', async () => {
    const fd = new FormData()
    fd.set('profilePublic', 'false')
    await updateProfileVisibility(fd)
    const tags = vi.mocked(updateTag).mock.calls.map((c) => c[0])
    expect(tags).toEqual(expect.arrayContaining([`profile:${mocks.user!.id}`, 'review-authors']))
    expect(tags).not.toContain('teas')
    expect(revalidatePath).toHaveBeenCalledWith(`/u/${mocks.user!.id}`)
  })
})
