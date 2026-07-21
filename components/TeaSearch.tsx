'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

type TeaResult = {
  id: number
  name: string
}

export function TeaSearch({
  onSelect,
}: {
  onSelect: (tea: { id: number; name: string }) => void
}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TeaResult[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const search = useCallback(async (q: string) => {
    if (q.length < 2) {
      setResults([])
      setIsOpen(false)
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/teas/search?q=${encodeURIComponent(q)}`)
      const data = await res.json()
      setResults(data)
      setIsOpen(data.length > 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(value), 300)
  }

  function handleSelect(tea: TeaResult) {
    setQuery(tea.name)
    setIsOpen(false)
    onSelect(tea)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      <input
        type="text"
        className="field"
        placeholder="Search for a tea..."
        value={query}
        onChange={(e) => handleChange(e.target.value)}
      />
      {loading && (
        <div
          className="subtle"
          style={{ position: 'absolute', right: 12, top: 12 }}
        >
          ...
        </div>
      )}
      {isOpen && results.length > 0 && (
        <ul
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            margin: '4px 0 0',
            padding: 0,
            listStyle: 'none',
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 100,
            maxHeight: 240,
            overflowY: 'auto',
          }}
        >
          {results.map((tea) => (
            <li key={tea.id}>
              <button
                type="button"
                onClick={() => handleSelect(tea)}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'transparent',
                  color: 'var(--color-ink)',
                  fontSize: 14,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
                onMouseOver={(e) =>
                  (e.currentTarget.style.background =
                    'var(--color-surface-2)')
                }
                onMouseOut={(e) =>
                  (e.currentTarget.style.background = 'transparent')
                }
              >
                {tea.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
