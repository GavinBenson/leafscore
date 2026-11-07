import { describe, expect, it } from 'vitest'
import { checkPhoto, MAX_PHOTO_BYTES, PHOTO_BAD_TYPE, PHOTO_TOO_LARGE, sniffPhotoType } from './photo'

const JPEG = [0xff, 0xd8, 0xff, 0xe0]
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]

describe('sniffPhotoType', () => {
  it.each([
    ['image/jpeg', JPEG],
    ['image/png', PNG],
    ['image/webp', WEBP],
  ])('recognises %s', (type, bytes) => {
    expect(sniffPhotoType(new Uint8Array(bytes))).toBe(type)
  })

  it('rejects SVG, other RIFF files and empty input', () => {
    expect(sniffPhotoType(new TextEncoder().encode('<svg xmlns="x">'))).toBeNull()
    expect(sniffPhotoType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]))).toBeNull()
    expect(sniffPhotoType(new Uint8Array())).toBeNull()
  })
})

describe('checkPhoto', () => {
  it('trusts the bytes, not the claimed type', async () => {
    const fake = new File(['<svg></svg>'], 'photo.png', { type: 'image/png' })
    expect(await checkPhoto(fake)).toEqual({ ok: false, message: PHOTO_BAD_TYPE })

    const real = new File([new Uint8Array(PNG)], 'photo.txt', { type: 'text/plain' })
    expect(await checkPhoto(real)).toEqual({ ok: true, type: 'image/png' })
  })

  it('enforces the size limit', async () => {
    const atLimit = new File([new Uint8Array(PNG), new Uint8Array(MAX_PHOTO_BYTES - PNG.length)], 'a.png')
    expect((await checkPhoto(atLimit)).ok).toBe(true)

    const overLimit = new File([new Uint8Array(MAX_PHOTO_BYTES + 1)], 'b.png')
    expect(await checkPhoto(overLimit)).toEqual({ ok: false, message: PHOTO_TOO_LARGE })
  })
})
