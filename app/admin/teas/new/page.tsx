import { db } from '@/db/client'
import { listBrands } from '@/lib/data/brands'
import { createTea } from '@/actions/admin'

export const metadata = {
  title: 'Add Tea',
}

const TEA_TYPES = [
  'Green',
  'Black',
  'Oolong',
  'White',
  'Pu-erh',
  'Yellow',
  'Herbal',
  'Rooibos',
]

const CAFFEINE_LEVELS = ['low', 'medium', 'high'] as const
const LEAF_STYLES = ['loose', 'bag', 'cake', 'powder'] as const

export default async function NewTeaPage() {
  const brands = await listBrands(db)

  return (
    <div style={{ maxWidth: 560 }}>
      <h1 className="section-title">Add Tea</h1>

      <form action={createTea} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
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
          <select id="brandId" name="brandId" className="field">
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
          <select id="type" name="type" required className="field">
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
