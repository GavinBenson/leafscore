import 'server-only'
import { del, put } from '@vercel/blob'
import { photoExtension, type PhotoType } from '@/lib/validation/photo'
import { captureError } from '@/lib/observability'

export async function uploadReviewPhoto(file: File, type: PhotoType, userId: number) {
  const { url } = await put(`reviews/${userId}/photo.${photoExtension(type)}`, file, {
    access: 'public',
    addRandomSuffix: true,
    contentType: type,
  })
  return url
}

// Best effort: the review change has already succeeded by the time this runs,
// so an orphaned blob should not turn it into an error for the user.
export async function deleteReviewPhoto(url: string | null | undefined) {
  if (!url) return
  try {
    await del(url)
  } catch (error) {
    captureError(error, { op: 'deleteReviewPhoto' })
  }
}

// Deletes many blobs for account deletion. Never throws: failures are logged
// and counted so the caller can report them, since the account is already gone.
export async function deleteReviewPhotos(urls: string[]): Promise<{ failed: number }> {
  if (urls.length === 0) return { failed: 0 }
  try {
    await del(urls)
    return { failed: 0 }
  } catch (error) {
    captureError(error, { op: 'deleteReviewPhotos', count: urls.length })
    return { failed: urls.length }
  }
}
