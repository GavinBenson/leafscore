import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { createTestDb } from '@/db/testDb'
import { updateTag } from 'next/cache'
import { getUserById } from '@/lib/data/users'

const mocks = vi.hoisted(() => ({
  db: null as unknown as Awaited<ReturnType<typeof createTestDb>>,
  user: null as { id: number } | null,
  limit: { ok: true } as { ok: true } | { ok: false; message: string; retryAfterSeconds: number },
  subs: [] as { id: string; status: string }[],
  list: vi.fn(),
  cancel: vi.fn(async () => ({})),
  sessionsList: vi.fn(),
  sessionsExpire: vi.fn(async () => ({})),
  customersDel: vi.fn(async () => ({})),
  removePhotos: vi.fn(async () => ({ failed: 0 })),
  signOut: vi.fn(async () => {}),
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
vi.mock('@/lib/auth', () => ({ signOut: mocks.signOut }))
vi.mock('@/lib/photos', () => ({ deleteReviewPhotos: mocks.removePhotos }))
vi.mock('@/lib/stripe', () => ({
  getStripe: () => ({
    subscriptions: { list: mocks.list, cancel: mocks.cancel },
    checkout: { sessions: { list: mocks.sessionsList, expire: mocks.sessionsExpire } },
    customers: { del: mocks.customersDel },
  }),
}))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))

const { deleteAccount } = await import('./account')
const { createTestDb: boot, seedTestUser, seedTestTea } = await import('@/db/testDb')
const { createReview } = await import('@/lib/data/reviews')
const { updateUserPremium } = await import('@/lib/data/users')

const form = (confirmation: string) => {
  const fd = new FormData()
  fd.set('confirmation', confirmation)
  return fd
}
const idle = { status: 'idle' as const }

describe('deleteAccount', () => {
  let userId: number
  const db_review = async () => {
    const tea = await seedTestTea(mocks.db)
    await createReview(mocks.db, { userId, teaId: tea.id, score: 80, photoUrl: 'https://blob/a.png' })
  }

  beforeEach(async () => {
    mocks.db = await boot()
    userId = (await seedTestUser(mocks.db)).id
    mocks.user = { id: userId }
    mocks.limit = { ok: true }
    mocks.subs = [
      { id: 'sub_1', status: 'active' },
      { id: 'sub_old', status: 'canceled' },
    ]
    mocks.list.mockReset()
    mocks.list.mockImplementation(async () => ({ data: mocks.subs }))
    mocks.cancel.mockClear()
    mocks.sessionsList.mockReset()
    mocks.sessionsList.mockImplementation(async () => ({ data: [{ id: 'cs_open' }] }))
    mocks.sessionsExpire.mockClear()
    mocks.customersDel.mockClear()
    mocks.removePhotos.mockImplementation(async () => ({ failed: 0 }))
    mocks.removePhotos.mockClear()
    mocks.signOut.mockClear()
  })

  it('rejects a wrong confirmation without touching anything', async () => {
    const res = await deleteAccount(idle, form('delete'))
    expect(res.status).toBe('error')
    expect(await getUserById(mocks.db, userId)).not.toBeNull()
  })

  it('redirects to sign-in when signed out', async () => {
    mocks.user = null
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/signin')
  })

  it('stops when rate limited', async () => {
    mocks.limit = { ok: false, message: 'Slow down.', retryAfterSeconds: 60 }
    const res = await deleteAccount(idle, form('DELETE'))
    expect(res).toEqual({ status: 'error', message: 'Slow down.' })
    expect(await getUserById(mocks.db, userId)).not.toBeNull()
  })

  it('cancels active subscriptions, deletes the user, removes photos, signs out, redirects', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/goodbye')

    expect(mocks.cancel).toHaveBeenCalledTimes(1)
    expect(mocks.cancel).toHaveBeenCalledWith('sub_1')
    expect(await getUserById(mocks.db, userId)).toBeNull()
    expect(mocks.removePhotos).toHaveBeenCalledWith([])
    expect(mocks.signOut).toHaveBeenCalled()
    expect(updateTag).toHaveBeenCalledWith(`profile:${userId}`)
    expect(updateTag).toHaveBeenCalledWith('tea-pages')
    expect(updateTag).toHaveBeenCalledWith('teas')
  })

  it('aborts the deletion when Stripe fails', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    mocks.cancel.mockRejectedValueOnce(new Error('stripe down'))
    const res = await deleteAccount(idle, form('DELETE'))
    expect(res.status).toBe('error')
    expect(res.message).toMatch(/not deleted/)
    expect(await getUserById(mocks.db, userId)).not.toBeNull()
    expect(mocks.signOut).not.toHaveBeenCalled()
  })

  it('cancels paused and incomplete subscriptions, expires open sessions and deletes the customer', async () => {
    mocks.subs = [
      { id: 'sub_paused', status: 'paused' },
      { id: 'sub_inc', status: 'incomplete' },
      { id: 'sub_trial', status: 'trialing' },
      { id: 'sub_old', status: 'canceled' },
    ]
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/goodbye')
    expect(mocks.cancel.mock.calls.map((c) => (c as unknown[])[0]).sort()).toEqual(['sub_inc', 'sub_paused', 'sub_trial'])
    expect(mocks.sessionsExpire).toHaveBeenCalledWith('cs_open')
    expect(mocks.customersDel).toHaveBeenCalledWith('cus_1')
  })

  it('aborts when the customer cannot be deleted', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    mocks.customersDel.mockRejectedValueOnce(new Error('stripe down'))
    expect((await deleteAccount(idle, form('DELETE'))).message).toMatch(/not deleted/)
    expect(await getUserById(mocks.db, userId)).not.toBeNull()
  })

  it('treats an already deleted customer as done', async () => {
    await updateUserPremium(mocks.db, userId, { stripeCustomerId: 'cus_1' })
    mocks.sessionsList.mockRejectedValueOnce(Object.assign(new Error('No such customer'), { code: 'resource_missing' }))
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/goodbye')
  })

  it('logs the photo urls when blob cleanup fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.removePhotos.mockImplementation(async () => ({ failed: 1 }))
    await db_review()
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/goodbye')
    const logged = spy.mock.calls.map((c) => String(c[0])).join(' ')
    spy.mockRestore()
    expect(logged).toContain('https://blob/a.png')
    expect(logged).not.toContain('example.com')
  })

  it('skips Stripe for users without a customer id', async () => {
    await expect(deleteAccount(idle, form('DELETE'))).rejects.toThrow('REDIRECT:/goodbye')
    expect(mocks.list).not.toHaveBeenCalled()
  })
})
