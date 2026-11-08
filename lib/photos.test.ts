import { beforeEach, describe, expect, it, vi } from 'vitest'

const blob = vi.hoisted(() => ({
  put: vi.fn(async (path: string) => ({ url: `https://blob.test/${path}` })),
  del: vi.fn(async (urls: unknown) => { void urls }),
}))
vi.mock('@vercel/blob', () => blob)

const { uploadReviewPhoto, deleteReviewPhoto, deleteReviewPhotos } = await import('./photos')

describe('lib/photos', () => {
  beforeEach(() => {
    blob.put.mockClear()
    blob.del.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('does not trust the client filename or type: path comes from user id and sniffed type', async () => {
    const file = new File([new Uint8Array([1])], '../../evil.svg', { type: 'image/svg+xml' })
    const url = await uploadReviewPhoto(file, 'image/png', 7)
    const [path, , options] = blob.put.mock.calls[0] as unknown as [string, File, Record<string, unknown>]
    expect(path).toBe('reviews/7/photo.png')
    expect(url).toContain('reviews/7/photo.png')
    expect(options).toMatchObject({ access: 'public', addRandomSuffix: true, contentType: 'image/png' })
    expect(path).not.toContain('evil')
  })

  it('deleteReviewPhoto ignores empty urls and never throws', async () => {
    await deleteReviewPhoto(null)
    expect(blob.del).not.toHaveBeenCalled()
    blob.del.mockRejectedValueOnce(new Error('boom'))
    await expect(deleteReviewPhoto('https://blob.test/x')).resolves.toBeUndefined()
  })

  it('deleteReviewPhotos reports failures without throwing', async () => {
    expect(await deleteReviewPhotos([])).toEqual({ failed: 0 })
    expect(await deleteReviewPhotos(['a', 'b'])).toEqual({ failed: 0 })
    blob.del.mockRejectedValueOnce(new Error('boom'))
    expect(await deleteReviewPhotos(['a', 'b'])).toEqual({ failed: 2 })
  })
})
