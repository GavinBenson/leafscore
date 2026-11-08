import { TEA_TYPES } from '@/lib/teaTypes'

export const MAX_REQUEST_NAME_LENGTH = 120
export const MAX_REQUEST_BRAND_LENGTH = 80

export type TeaRequestField = 'name' | 'brand' | 'type'
export type TeaRequestFieldErrors = Partial<Record<TeaRequestField, string>>

export type ParsedTeaRequest =
  | { ok: true; data: { name: string; brand?: string; type?: string } }
  | { ok: false; errors: TeaRequestFieldErrors }

function text(formData: FormData, key: string): string {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

export function parseTeaRequestForm(formData: FormData): ParsedTeaRequest {
  const errors: TeaRequestFieldErrors = {}
  const name = text(formData, 'name')
  const brand = text(formData, 'brand')
  const type = text(formData, 'type')

  if (name.length === 0) errors.name = 'Enter the name of the tea.'
  else if (name.length > MAX_REQUEST_NAME_LENGTH) {
    errors.name = `Keep the name to ${MAX_REQUEST_NAME_LENGTH} characters or fewer.`
  }
  if (brand.length > MAX_REQUEST_BRAND_LENGTH) {
    errors.brand = `Keep the brand to ${MAX_REQUEST_BRAND_LENGTH} characters or fewer.`
  }
  if (type && !(TEA_TYPES as readonly string[]).includes(type)) {
    errors.type = 'Choose a type from the list.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, data: { name, brand: brand || undefined, type: type || undefined } }
}
