'use server'

import { revalidatePath } from 'next/cache'
import { revalidateTeaCaches } from '@/lib/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import {
  createTeaRequest,
  getTeaRequest,
  markRequestApproved,
  updateRequestStatus,
  MAX_PENDING_REQUESTS_PER_USER,
} from '@/lib/data/teaRequests'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { requireAdmin } from '@/lib/requireAdmin'
import { getCurrentUser } from '@/lib/session'
import { TEA_TYPES } from '@/lib/teaTypes'
import { captureError } from '@/lib/observability'
import { parseTeaRequestStatus } from '@/lib/validation/tea'
import {
  parseTeaRequestForm,
  type TeaRequestFieldErrors,
} from '@/lib/validation/teaRequest'

export type TeaRequestFormState = {
  message?: string
  fieldErrors?: TeaRequestFieldErrors
  // Echoed back so a failed submit doesn't wipe what the user typed.
  values?: { name: string; brand: string; type: string }
}

function echo(formData: FormData) {
  const get = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value : ''
  }
  return { name: get('name'), brand: get('brand'), type: get('type') }
}

class AlreadyResolvedError extends Error {}

export async function submitTeaRequest(
  _prev: TeaRequestFormState,
  formData: FormData,
): Promise<TeaRequestFormState> {
  const values = echo(formData)
  const user = await getCurrentUser()
  if (!user) {
    return { values, message: 'Your session has ended. Sign in again to send this request.' }
  }

  const parsed = parseTeaRequestForm(formData)
  if (!parsed.ok) {
    return { values, message: 'Check the highlighted fields.', fieldErrors: parsed.errors }
  }

  try {
    if (await isBanned(db, user.id)) return { values, message: BANNED_MESSAGE }

    const limited = await enforceRateLimit('tea-request', {
      limit: 10,
      windowSeconds: 86_400,
      userId: user.id,
    })
    if (!limited.ok) return { values, message: limited.message }

    const result = await createTeaRequest(db, { userId: user.id, ...parsed.data })
    if (!result.ok) {
      return {
        values,
        message:
          result.reason === 'too_many_pending'
            ? `You already have ${MAX_PENDING_REQUESTS_PER_USER} requests waiting. We'll review them before you send more.`
            : 'Someone has already asked for this tea and it is waiting for review. Thanks for checking.',
      }
    }
  } catch (error) {
    captureError(error, { action: 'submitTeaRequest', userId: user.id })
    return { values, message: "We couldn't send your request. Try again in a moment." }
  }

  revalidatePath('/requests')
  revalidatePath('/admin/requests')
  redirect('/requests?sent=1')
}

// Declines a pending request. Only pending requests can change state.
export async function declineTeaRequest(requestId: number) {
  await requireAdmin()
  const request = await getTeaRequest(db, requestId)
  if (request?.status === 'pending') await updateRequestStatus(db, requestId, 'rejected')
  revalidatePath('/admin/requests')
  revalidatePath('/requests')
}

// Kept for older callers: only a decline goes through here now. Approving means
// creating the tea (see approveRequestWithTea). Admin-gated before the status is
// looked at, so a non-admin learns nothing about valid values.
export async function handleTeaRequest(
  requestId: number,
  status: string,
): Promise<{ ok: boolean; message?: string }> {
  await requireAdmin()

  const parsed = parseTeaRequestStatus(status)
  if (!parsed) return { ok: false, message: 'That is not a valid request status.' }
  if (parsed === 'approved') return { ok: false, message: 'Approve a request by creating the tea.' }
  if (parsed === 'pending') return { ok: false, message: 'A request can only be declined here.' }
  await declineTeaRequest(requestId)
  return { ok: true }
}

// Creates the tea from /admin/teas/new?requestId=N and marks the request approved.
export async function approveRequestWithTea(formData: FormData): Promise<void> {
  await requireAdmin()

  const fail = (message: string): never =>
    redirect(`/admin/teas/new?requestId=${encodeURIComponent(String(formData.get('requestId')))}&error=${encodeURIComponent(message)}`)

  const requestId = Number(formData.get('requestId'))
  if (!Number.isSafeInteger(requestId) || requestId < 1) redirect('/admin/requests')
  const request = await getTeaRequest(db, requestId)
  if (!request) redirect('/admin/requests')
  if (request.status !== 'pending') redirect('/admin/requests')

  const str = (key: string) => {
    const value = formData.get(key)
    return typeof value === 'string' ? value.trim() : ''
  }
  const name = str('name')
  const type = str('type')
  if (!name || name.length > 120) return fail('Enter a tea name of 120 characters or fewer.')
  if (!(TEA_TYPES as readonly string[]).includes(type)) return fail('Choose a tea type.')
  const brandRaw = str('brandId')
  const brandId = /^\d+$/.test(brandRaw) && Number.isSafeInteger(Number(brandRaw)) ? Number(brandRaw) : undefined
  const caffeine = str('caffeineLevel')
  const leafStyle = str('leafStyle')

  try {
    await db.transaction(async (tx) => {
      const [tea] = await tx
        .insert(schema.teas)
        .values({
          name,
          brandId,
          type,
          subtype: str('subtype') || undefined,
          origin: str('origin') || undefined,
          caffeineLevel: (['low', 'medium', 'high'] as const).find((v) => v === caffeine),
          leafStyle: (['loose', 'bag', 'cake', 'powder'] as const).find((v) => v === leafStyle),
        })
        .returning()
      // Throwing rolls the tea back when another admin resolved the request first.
      if (!(await markRequestApproved(tx, requestId, tea.id))) throw new AlreadyResolvedError()
    })
  } catch (error) {
    if (error instanceof AlreadyResolvedError) redirect('/admin/requests')
    captureError(error, { action: 'approveRequestWithTea', requestId })
    return fail("We couldn't create the tea. Try again.")
  }

  revalidateTeaCaches()
  revalidatePath('/admin/teas')
  revalidatePath('/admin/requests')
  revalidatePath('/requests')
  revalidatePath('/browse')
  redirect('/admin/requests')
}
