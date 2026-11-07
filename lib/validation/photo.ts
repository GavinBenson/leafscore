// Vercel functions reject request bodies over 4.5MB, so stay under that.
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024
export const PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp'

const EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const

export type PhotoType = keyof typeof EXTENSIONS

// Reads the file's real type from its first bytes, since the browser-supplied
// type and extension are whatever the client says they are.
export function sniffPhotoType(bytes: Uint8Array): PhotoType | null {
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((byte, i) => bytes[offset + i] === byte)

  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  // RIFF....WEBP
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return 'image/webp'
  }
  return null
}

export function photoExtension(type: PhotoType) {
  return EXTENSIONS[type]
}

export const PHOTO_TOO_LARGE = 'Photos must be 4MB or smaller.'
export const PHOTO_BAD_TYPE = 'Photos must be JPEG, PNG or WebP images.'

export async function checkPhoto(
  file: File,
): Promise<{ ok: true; type: PhotoType } | { ok: false; message: string }> {
  if (file.size > MAX_PHOTO_BYTES) return { ok: false, message: PHOTO_TOO_LARGE }
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const type = sniffPhotoType(header)
  if (!type) return { ok: false, message: PHOTO_BAD_TYPE }
  return { ok: true, type }
}
