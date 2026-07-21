'use client'

import { useRouter, useSearchParams } from 'next/navigation'

type FilterBarProps = {
  types: string[]
  currentType?: string
  currentSort?: string
}

export function FilterBar({ types, currentType, currentSort }: FilterBarProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(searchParams.toString())
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset to page 1 on filter change
    params.delete('page')
    router.push(`/browse?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      {/* Type filter chips */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          flex: 1,
          paddingBottom: 4,
        }}
      >
        <button
          className={`tag${!currentType ? ' tag-accent' : ''}`}
          onClick={() => setParam('type', undefined)}
          style={{ cursor: 'pointer', border: 'none' }}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t}
            className={`tag${currentType === t ? ' tag-accent' : ''}`}
            onClick={() => setParam('type', t)}
            style={{ cursor: 'pointer', border: 'none', whiteSpace: 'nowrap' }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Sort dropdown */}
      <select
        className="field"
        value={currentSort ?? 'score'}
        onChange={(e) => setParam('sort', e.target.value)}
        style={{ width: 'auto', height: 32, fontSize: 13, flexShrink: 0 }}
      >
        <option value="score">Top Rated</option>
        <option value="newest">Newest</option>
        <option value="name">Name</option>
      </select>
    </div>
  )
}
