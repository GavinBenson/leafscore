'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { BANNED_MESSAGE, isBanned } from '@/lib/banGuard'
import { buildCellarRaw, isLowStock, type CellarFormValues } from '@/lib/cellar'
import {
  deleteCellarItem,
  getCellarItemForTea,
  updateCellarItem,
  upsertCellarItem,
  type CellarWriteResult,
} from '@/lib/data/cellar'
import { getUserById } from '@/lib/data/users'
import { addToWishlistWithinCap } from '@/lib/data/wishlist'
import { parseId } from '@/lib/ids'
import { canUseCellar, FREE_WISHLIST_LIMIT } from '@/lib/premium'
import { enforceRateLimit } from '@/lib/rateLimitGuard'
import { getCurrentUser } from '@/lib/session'
import type { WeightUnit } from '@/lib/units'

export type CellarFormState = {
  message?: string
  fieldErrors?: Partial<Record<keyof CellarFormValues, string>>
  values?: CellarFormValues
}

export type CellarActionResult = { ok: boolean; message?: string; limitReached?: boolean }

const SIGNED_OUT = 'Your session has ended. Sign in again to use your cellar.'
const PREMIUM_ONLY = 'The tea cellar is a Premium feature.'
const GENERIC = "We couldn't save that. Try again in a moment."
const NOT_FOUND = "We couldn't find that cellar entry."

// Authentication, the Premium gate, the ban check and the rate limit. Every
// cellar action calls this first: the gate lives here, not only in the UI.
type Guard =
  | { user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>; message?: undefined }
  | { user?: undefined; message: string }

async function guard(): Promise<Guard> {
  const user = await getCurrentUser()
  if (!user) return { message: SIGNED_OUT }
  if (!canUseCellar(user.isPremium)) return { message: PREMIUM_ONLY }
  if (await isBanned(db, user.id)) return { message: BANNED_MESSAGE }
  const limited = await enforceRateLimit('cellar', { limit: 120, windowSeconds: 3600, userId: user.id })
  if (!limited.ok) return { message: limited.message }
  return { user }
}

function text(formData: FormData, key: string): string {
  const v = formData.get(key)
  return typeof v === 'string' ? v : ''
}

function readValues(formData: FormData): CellarFormValues {
  return {
    amount: text(formData, 'amount'),
    purchasedAt: text(formData, 'purchasedAt'),
    price: text(formData, 'price'),
    currency: text(formData, 'currency'),
    lowStock: text(formData, 'lowStock'),
    notes: text(formData, 'notes'),
  }
}

const FIELD_NAMES = {
  grams: 'amount',
  purchasedAt: 'purchasedAt',
  priceCents: 'price',
  currency: 'currency',
  lowStockGrams: 'lowStock',
  notes: 'notes',
}

function refresh() {
  revalidatePath('/cellar')
  revalidatePath('/journal')
}

// Add (teaId) or edit (itemId) one cellar entry. Amounts are typed in the
// person's weight unit and stored as grams.
export async function saveCellarItemAction(_prev: CellarFormState, formData: FormData): Promise<CellarFormState> {
  const values = readValues(formData)
  const itemId = formData.get('itemId') ? parseId(text(formData, 'itemId')) : null
  const teaId = parseId(text(formData, 'teaId'))
  if (formData.get('itemId') ? itemId === null : teaId === null) {
    return { message: "We couldn't find that tea.", values }
  }
  try {
    const g = await guard()
    if (!g.user) return { message: g.message, values }

    const profile = await getUserById(db, g.user.id)
    const unit: WeightUnit = profile?.weightUnit === 'oz' ? 'oz' : 'g'
    const built = buildCellarRaw(values, unit)
    if (!built.ok) return { message: built.error, fieldErrors: { [built.field]: built.error }, values }

    let result: CellarWriteResult
    if (itemId !== null) result = await updateCellarItem(db, g.user.id, itemId, built.raw)
    else result = await upsertCellarItem(db, g.user.id, teaId as number, built.raw)

    if (!result.ok) {
      if (result.reason === 'invalid') {
        const field = FIELD_NAMES[result.field]
        return { message: result.error, fieldErrors: { [field]: result.error }, values }
      }
      return { message: result.reason === 'tea_not_found' ? 'That tea is no longer available.' : NOT_FOUND, values }
    }
    refresh()
  } catch (error) {
    console.error('saveCellarItemAction failed', error)
    return { message: GENERIC, values }
  }
  redirect('/cellar?saved=1')
}

export async function deleteCellarItemAction(rawItemId: number): Promise<CellarActionResult> {
  const itemId = parseId(rawItemId)
  if (itemId === null) return { ok: false, message: NOT_FOUND }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }
    if (!(await deleteCellarItem(db, g.user.id, itemId))) return { ok: false, message: NOT_FOUND }
    refresh()
    return { ok: true }
  } catch (error) {
    console.error('deleteCellarItemAction failed', error)
    return { ok: false, message: GENERIC }
  }
}

// One click from a low-stock row. Respects the free wishlist cap (Premium is
// unlimited, but the cellar already requires Premium, so the cap is a safety net).
export async function addLowStockToWishlistAction(rawTeaId: number): Promise<CellarActionResult> {
  const teaId = parseId(rawTeaId)
  if (teaId === null) return { ok: false, message: "We couldn't find that tea." }
  try {
    const g = await guard()
    if (!g.user) return { ok: false, message: g.message }

    const item = await getCellarItemForTea(db, g.user.id, teaId)
    if (!item || !isLowStock(item.grams, item.lowStockGrams)) {
      return { ok: false, message: 'That tea is not low on stock.' }
    }
    const result = await addToWishlistWithinCap(db, g.user.id, teaId, g.user.isPremium ? null : FREE_WISHLIST_LIMIT)
    if (result === 'limit') {
      return {
        ok: false,
        limitReached: true,
        message: `Free accounts can keep ${FREE_WISHLIST_LIMIT} teas on a wishlist. Upgrade to Premium for unlimited.`,
      }
    }
    revalidatePath('/journal')
    revalidatePath(`/browse/${teaId}`)
    return { ok: true, message: result === 'exists' ? 'Already on your wishlist.' : 'Added to your wishlist.' }
  } catch (error) {
    console.error('addLowStockToWishlistAction failed', error)
    return { ok: false, message: GENERIC }
  }
}
