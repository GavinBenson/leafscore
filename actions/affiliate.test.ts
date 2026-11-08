import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  revalidateTeaCaches: vi.fn(),
  create: vi.fn(async () => ({})),
  update: vi.fn(async (): Promise<unknown> => ({})),
  remove: vi.fn(async () => {}),
}))

vi.mock('@/db/client', () => ({ db: {} }))
vi.mock('@/lib/requireAdmin', () => ({ requireAdmin: async () => ({ id: 1 }) }))
vi.mock('@/lib/cache', () => ({ revalidateTeaCaches: mocks.revalidateTeaCaches }))
vi.mock('@/lib/data/affiliate', () => ({
  createAffiliateLink: mocks.create,
  updateAffiliateLink: mocks.update,
  deleteAffiliateLink: mocks.remove,
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`)
  },
}))

const { saveAffiliateLink, removeAffiliateLink } = await import('./affiliate')

function form(values: Record<string, string>) {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

const valid = { teaId: '5', provider: 'Shop', url: 'https://shop.example/tea', price: '9.50', currency: 'USD' }

describe('affiliate actions expire the tea cache', () => {
  beforeEach(() => vi.clearAllMocks())

  it('on create', async () => {
    await expect(saveAffiliateLink(form(valid))).rejects.toThrow('REDIRECT:/admin/teas/5/affiliate')
    expect(mocks.create).toHaveBeenCalled()
    expect(mocks.revalidateTeaCaches).toHaveBeenCalledWith(5)
  })

  it('on edit', async () => {
    await expect(saveAffiliateLink(form({ ...valid, linkId: '3' }))).rejects.toThrow('REDIRECT')
    expect(mocks.revalidateTeaCaches).toHaveBeenCalledWith(5)
  })

  it('on remove', async () => {
    await expect(removeAffiliateLink(form({ teaId: '5', linkId: '3' }))).rejects.toThrow('REDIRECT')
    expect(mocks.remove).toHaveBeenCalled()
    expect(mocks.revalidateTeaCaches).toHaveBeenCalledWith(5)
  })

  it('not when nothing was written', async () => {
    mocks.update.mockResolvedValueOnce(null)
    await expect(saveAffiliateLink(form({ ...valid, linkId: '3' }))).rejects.toThrow('REDIRECT')
    await expect(saveAffiliateLink(form({ ...valid, url: 'nope' }))).rejects.toThrow('REDIRECT')
    expect(mocks.revalidateTeaCaches).not.toHaveBeenCalled()
  })
})
