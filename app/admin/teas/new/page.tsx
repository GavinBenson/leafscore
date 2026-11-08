import { db } from '@/db/client'
import { listBrands } from '@/lib/data/brands'
import { createTea } from '@/actions/admin'
import { approveRequestWithTea } from '@/actions/teaRequests'
import { getTeaRequest } from '@/lib/data/teaRequests'
import { TEA_TYPES } from '@/lib/teaTypes'

export const metadata = {
  title: 'Add Tea',
}

const CAFFEINE_LEVELS = ['low', 'medium', 'high'] as const
const LEAF_STYLES = ['loose', 'bag', 'cake', 'powder'] as const

export default async function NewTeaPage({
  searchParams,
}: {
  searchParams: Promise<{ requestId?: string; error?: string }>
}) {
  const sp = await searchParams
  const brands = await listBrands(db)
  const requestId = /^\d+$/.test(sp.requestId ?? '') ? Number(sp.requestId) : null
  const request = requestId ? await getTeaRequest(db, requestId) : null
  const pending = request?.status === 'pending' ? request : null
  const prefillBrand = pending?.brand
    ? brands.find((b) => b.name.toLowerCase() === pending.brand!.toLowerCase())
    : undefined

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="section-title">Add Tea</h1>

      {pending && (
        <p className="subtle">
          Creating a tea from the request &ldquo;{pending.name}&rdquo;
          {pending.brand ? ` (brand: ${pending.brand})` : ''}. Saving it approves the request.
        </p>
      )}
      {sp.error && (
        <p className="form-error" role="alert">
          {sp.error}
        </p>
      )}

      <form action={pending ? approveRequestWithTea : createTea} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {pending && <input type="hidden" name="requestId" value={pending.id} />}
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            className="field"
            placeholder="e.g. Dragon Well"
            defaultValue={pending?.name}
          />
        </div>

        {/* Brand */}
        <div>
          <label
            htmlFor="brandId"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Brand
          </label>
          <select id="brandId" name="brandId" className="field" defaultValue={prefillBrand?.id ?? ''}>
            <option value="">No brand</option>
            {brands.map((brand) => (
              <option key={brand.id} value={brand.id}>
                {brand.name}
              </option>
            ))}
          </select>
        </div>

        {/* Type */}
        <div>
          <label
            htmlFor="type"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Type *
          </label>
          <select id="type" name="type" required className="field" defaultValue={pending?.type ?? ''}>
            <option value="">Select type</option>
            {TEA_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        {/* Subtype */}
        <div>
          <label
            htmlFor="subtype"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Subtype
          </label>
          <input
            id="subtype"
            name="subtype"
            type="text"
            className="field"
            placeholder="e.g. Longjing"
          />
        </div>

        {/* Origin */}
        <div>
          <label
            htmlFor="origin"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Origin
          </label>
          <input
            id="origin"
            name="origin"
            type="text"
            className="field"
            placeholder="e.g. Zhejiang, China"
          />
        </div>

        {/* Caffeine Level */}
        <div>
          <label
            htmlFor="caffeineLevel"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Caffeine Level
          </label>
          <select id="caffeineLevel" name="caffeineLevel" className="field">
            <option value="">Not specified</option>
            {CAFFEINE_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level.charAt(0).toUpperCase() + level.slice(1)}
              </option>
            ))}
          </select>
        </div>

        {/* Leaf Style */}
        <div>
          <label
            htmlFor="leafStyle"
            style={{ display: 'block', fontWeight: 600, fontSize: 14, marginBottom: 6 }}
          >
            Leaf Style
          </label>
          <select id="leafStyle" name="leafStyle" className="field">
            <option value="">Not specified</option>
            {LEAF_STYLES.map((style) => (
              <option key={style} value={style}>
                {style.charAt(0).toUpperCase() + style.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="btn btn-primary" style={{ alignSelf: 'flex-start' }}>
          Add Tea
        </button>
      </form>
    </div>
  )
}
