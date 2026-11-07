import { del, put } from '@vercel/blob'
import { photoExtension, type PhotoType } from '@/lib/validation/photo'

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
    console.error('deleteReviewPhoto failed', error)
  }
}
