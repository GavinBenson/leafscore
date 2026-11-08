'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type FilterBarProps = {
  types: string[]
  brands: { id: number; name: string }[]
  subtypes: string[]
  origins: string[]
  currentType?: string
  currentSort?: string
  currentQuery?: string
  currentBrand?: string
  currentSubtype?: string
  currentOrigin?: string
}

const SEARCH_DEBOUNCE_MS = 300

const chipStyle = {
  cursor: 'pointer',
  border: 'none',
  whiteSpace: 'nowrap',
  minHeight: 44,
  minWidth: 44,
  padding: '0 16px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: 0,
} as const

const selectStyle = { width: 'auto', minHeight: 44, fontSize: 14, maxWidth: '100%' } as const

export function FilterBar({
  types,
  brands,
  subtypes,
  origins,
  currentType,
  currentSort,
  currentQuery = '',
  currentBrand,
  currentSubtype,
  currentOrigin,
}: FilterBarProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [text, setText] = useState(currentQuery)
  const [lastSent, setLastSent] = useState(currentQuery)
  const [seenQuery, setSeenQuery] = useState(currentQuery)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // A change that did not come from typing here (Clear filters, back button) wins.
  if (currentQuery !== seenQuery) {
    setSeenQuery(currentQuery)
    if (currentQuery !== lastSent) {
      setText(currentQuery)
      setLastSent(currentQuery)
    }
  }

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function setParam(key: string, value: string | undefined) {
    const params = new URLSearchParams(window.location.search)
    if (value) {
      params.set(key, value)
    } else {
      params.delete(key)
    }
    // Reset to page 1 on filter change
    params.delete('page')
    const qs = params.toString()
    startTransition(() => {
      router.replace(`/browse${qs ? `?${qs}` : ''}`)
    })
  }

  function onSearchChange(value: string) {
    setText(value)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const trimmed = value.trim()
      setLastSent(trimmed)
      setParam('q', trimmed || undefined)
    }, SEARCH_DEBOUNCE_MS)
  }

  return (
    <div
      role="search"
      aria-busy={isPending}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        marginBottom: 20,
        opacity: isPending ? 0.7 : 1,
      }}
    >
      <div>
        <label htmlFor="browse-search" className="subtle" style={{ display: 'block', marginBottom: 4 }}>
          Search teas or brands
        </label>
        <input
          id="browse-search"
          type="search"
          className="field"
          value={text}
          maxLength={100}
          autoComplete="off"
          onChange={(e) => onSearchChange(e.target.value)}
          style={{ minHeight: 44 }}
        />
      </div>

      {/* Type filter chips */}
      <div
        role="group"
        aria-label="Tea type"
        style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}
      >
        <button
          type="button"
          className={`tag${!currentType ? ' tag-accent' : ''}`}
          aria-pressed={!currentType}
          onClick={() => setParam('type', undefined)}
          style={chipStyle}
        >
          All
        </button>
        {types.map((t) => (
          <button
            key={t}
            type="button"
            className={`tag${currentType === t ? ' tag-accent' : ''}`}
            aria-pressed={currentType === t}
            onClick={() => setParam('type', currentType === t ? undefined : t)}
            style={chipStyle}
          >
            {t}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <FilterSelect
          id="browse-brand"
          label="Brand"
          value={currentBrand ?? ''}
          allLabel="All brands"
          options={brands.map((b) => ({ value: String(b.id), label: b.name }))}
          onChange={(v) => setParam('brand', v || undefined)}
        />
        {subtypes.length > 0 && (
          <FilterSelect
            id="browse-subtype"
            label="Style"
            value={currentSubtype ?? ''}
            allLabel="All styles"
            options={subtypes.map((v) => ({ value: v, label: v }))}
            onChange={(v) => setParam('subtype', v || undefined)}
          />
        )}
        {origins.length > 0 && (
          <FilterSelect
            id="browse-origin"
            label="Origin"
            value={currentOrigin ?? ''}
            allLabel="All origins"
            options={origins.map((v) => ({ value: v, label: v }))}
            onChange={(v) => setParam('origin', v || undefined)}
          />
        )}
        <div>
          <label htmlFor="browse-sort" className="subtle" style={{ display: 'block', marginBottom: 4 }}>
            Sort by
          </label>
          <select
            id="browse-sort"
            className="field"
            value={currentSort ?? 'score'}
            onChange={(e) => setParam('sort', e.target.value === 'score' ? undefined : e.target.value)}
            style={selectStyle}
          >
            <option value="score">Top Rated</option>
            <option value="newest">Newest</option>
            <option value="name">Name</option>
          </select>
        </div>
      </div>
      {isPending && (
        <p className="subtle" role="status" style={{ margin: 0 }}>
          Updating...
        </p>
      )}
    </div>
  )
}

function FilterSelect({
  id,
  label,
  value,
  allLabel,
  options,
  onChange,
}: {
  id: string
  label: string
  value: string
  allLabel: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
}) {
  return (
    <div>
      <label htmlFor={id} className="subtle" style={{ display: 'block', marginBottom: 4 }}>
        {label}
      </label>
      <select
        id={id}
        className="field"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={selectStyle}
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
