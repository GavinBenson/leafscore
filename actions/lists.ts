'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { revalidateListCaches } from '@/lib/cache'
import {
  addTeaToList,
  createList,
  deleteList,
  getListWithTeas,
  removeTeaFromList,
  reorderList,
  updateList,
  type CreateListResult,
  type ListInputFailure,
} from '@/lib/data/lists'
import { parseId } from '@/lib/ids'
import { FREE_LIST_LIMIT, MAX_TEAS_PER_LIST } from '@/lib/premium'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'

export type ListFormState = {
  message?: string
  saved?: boolean
  fieldErrors?: { title?: string; description?: string }
  values?: { title: string; description: string; isPublic: boolean }
}

export type ListActionResult = { ok: boolean; message?: string; limitReached?: boolean; listId?: number }

const SIGNED_OUT = 'Your session has ended. Sign in again to manage your lists.'
const GENERIC = "We couldn't save that. Try again in a moment."
const NOT_FOUND = "We couldn't find that list."

function listLimitMessage(isPremium: boolean, limit: number) {
  return isPremium
    ? `You have reached the limit of ${limit} lists.`
    : `Free accounts can keep ${FREE_LIST_LIMIT} lists. Upgrade to Premium for more.`
}

// Authentication, ban check and rate limit shared by every list write.
type Guard =
  | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; message?: undefined }
  | { user?: undefined; message: string }

async function guard(): Promise<Guard> {
  const user = await getCurrentUser()
  if (!user) return { message: SIGNED_OUT }
  if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }
  const limited = await enforceRateLimit('lists', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limited.ok) return { message: limited.message }
  return { user }
}

function failureState(result: ListInputFailure, values: NonNullable<ListFormState['values']>): ListFormState {
  return { message: result.error, fieldErrors: { [result.field]: result.error }, values }
}

function readForm(formData: FormData) {
  const title = formData.get('title')
  const description = formData.get('description')
  return {
    title: typeof title === 'string' ? title : '',
    description: typeof description === 'string' ? description : '',
    isPublic: formData.get('isPublic') === 'on',
  }
}

function refreshList(listId?: number) {
  revalidateListCaches()
  revalidatePath('/lists')
  revalidatePath('/lists/mine')
  if (listId !== undefined) revalidatePath(`/lists/${listId}`)
}

function createFromValues(
  userId: number,
  isPremium: boolean,
  values: { title: string; description: string; isPublic: boolean },
): Promise<CreateListResult> {
  return createList(db, { userId, ...values }, isPremium)
}

export async function createListAction(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const values = readForm(formData)
  let listId: number
  try {
    const g = await guard()
    if (!g.user) return { message: g.message, values }
    const result = await createFromValues(g.user.id, g.user.isPremium, values)
    if (!result.ok) {
      if (result.reason === 'limit_reached') {
        return { message: listLimitMessage(g.user.isPremium, result.limit), values }
      }
      return failureState(result, values)
    }
    listId = result.list.id
    refreshList(listId)
  } catch (error) {
    console.error('createListAction failed', error)
    return { message: GENERIC, values }
  }
  redirect(`/lists/${listId}/edit`)
}

export async function updateListAction(_prev: ListFormState, formData: FormData): Promise<ListFormState> {
  const values = readForm(formData)
  const listId = parseId(formData.get('listId') as string | null)
  if (listId === null) return { message: NOT_FOUND, values }
  try {
    const g = await guard()
    if (!g.user) return { message: g.message, values }
    const result = await updateList(db, listId, g.user.id, values)
    if (!result.ok) {
      if (result.reason === 'not_found') return { message: NOT_FOUND, values }
      return failureState(result, values)
    }
    refreshList(listId)
    return { message: 'Saved.', saved: true, values }
  } catch (error) {
    console.error('updateListAction failed', error)
    return { message: GENERIC, values }
  }
}

export async function deleteListAction(rawListId: number): Promise<ListActionResult> {
  const listId = parseId(rawListId)
  if (listId === null) return { ok: false, message: NOT_FOUND }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }
    if (!(await deleteList(db, listId, g.user.id))) return { ok: false, message: NOT_FOUND }
    refreshList(listId)
    return { ok: true }
  } catch (error) {
    console.error('deleteListAction failed', error)
    return { ok: false, message: GENERIC }
  }
}

function addFailureMessage(reason: 'not_found' | 'tea_not_found' | 'list_full') {
  switch (reason) {
    case 'not_found':
      return NOT_FOUND
    case 'tea_not_found':
      return 'That tea is no longer available.'
    case 'list_full':
      return `A list can hold ${MAX_TEAS_PER_LIST} teas.`
  }
}

// Save-to-list checkbox: add or remove one tea on one of the user's lists.
export async function setTeaInListAction(
  rawListId: number,
  rawTeaId: number,
  want: boolean,
): Promise<ListActionResult & { contains?: boolean }> {
  const listId = parseId(rawListId)
  const teaId = parseId(rawTeaId)
  if (listId === null || teaId === null) return { ok: false, message: "We couldn't find that list or tea." }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }
    if (want) {
      const result = await addTeaToList(db, listId, g.user.id, teaId)
      if (!result.ok) return { ok: false, message: addFailureMessage(result.reason) }
    } else if (!(await removeTeaFromList(db, listId, g.user.id, teaId))) {
      return { ok: false, message: NOT_FOUND }
    }
    refreshList(listId)
    return { ok: true, contains: want }
  } catch (error) {
    console.error('setTeaInListAction failed', error)
    return { ok: false, message: GENERIC }
  }
}

// "New list" shortcut on the tea page: creates a private list holding the tea.
export async function createListWithTeaAction(
  rawTeaId: number,
  title: string,
): Promise<ListActionResult & { list?: { id: number; title: string; isPublic: boolean } }> {
  const teaId = parseId(rawTeaId)
  if (teaId === null) return { ok: false, message: 'That tea is no longer available.' }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }
    const result = await createFromValues(g.user.id, g.user.isPremium, {
      title: typeof title === 'string' ? title : '',
      description: '',
      isPublic: false,
    })
    if (!result.ok) {
      if (result.reason === 'limit_reached') {
        return { ok: false, limitReached: true, message: listLimitMessage(g.user.isPremium, result.limit) }
      }
      return { ok: false, message: result.error }
    }
    const added = await addTeaToList(db, result.list.id, g.user.id, teaId)
    refreshList(result.list.id)
    if (!added.ok) return { ok: false, message: addFailureMessage(added.reason) }
    return { ok: true, listId: result.list.id, list: { id: result.list.id, title: result.list.title, isPublic: false } }
  } catch (error) {
    console.error('createListWithTeaAction failed', error)
    return { ok: false, message: GENERIC }
  }
}

export async function removeTeaFromListAction(rawListId: number, rawTeaId: number): Promise<ListActionResult> {
  const result = await setTeaInListAction(rawListId, rawTeaId, false)
  return { ok: result.ok, message: result.message }
}

// Moves one tea a step up or down. The order is rebuilt on the server from the
// stored list, so a stale page cannot corrupt it (a mismatch is rejected).
export async function moveTeaInListAction(
  rawListId: number,
  rawTeaId: number,
  direction: 'up' | 'down',
): Promise<ListActionResult> {
  const listId = parseId(rawListId)
  const teaId = parseId(rawTeaId)
  if (listId === null || teaId === null || (direction !== 'up' && direction !== 'down')) {
    return { ok: false, message: "We couldn't find that list or tea." }
  }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }
    const data = await getListWithTeas(db, listId, g.user.id)
    if (!data || !data.isOwner) return { ok: false, message: NOT_FOUND }
    const order = data.teas.map((t) => t.tea.id)
    const index = order.indexOf(teaId)
    if (index === -1) return { ok: false, message: 'That tea is no longer on the list.' }
    const target = direction === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= order.length) return { ok: true }
    ;[order[index], order[target]] = [order[target], order[index]]
    const result = await reorderList(db, listId, g.user.id, order)
    if (!result.ok) {
      return {
        ok: false,
        message: result.reason === 'mismatch' ? 'The list changed. Reload the page and try again.' : NOT_FOUND,
      }
    }
    refreshList(listId)
    return { ok: true }
  } catch (error) {
    console.error('moveTeaInListAction failed', error)
    return { ok: false, message: GENERIC }
  }
}
