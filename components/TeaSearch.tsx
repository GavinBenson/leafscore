'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'

type TeaResult = {
  id: number
  name: string
}

type Status = 'idle' | 'loading' | 'done' | 'error'

// Rendered in the popup when a search returns nothing. Extend this (e.g. with a
// "request a tea" link) rather than changing the combobox plumbing below.
function NoResults({ query }: { query: string }) {
  const typed = query.trim()
  return (
    <div className="combobox-empty">
      No teas found.{' '}
      <Link
        href={typed ? `/requests/new?name=${encodeURIComponent(typed)}` : '/requests/new'}
        onMouseDown={(e) => e.preventDefault()}
      >
        Can&apos;t find your tea? Request it
      </Link>
    </div>
  )
}

export function TeaSearch({
  onSelect,
  id,
  describedBy,
  invalid,
}: {
  onSelect: (tea: { id: number; name: string }) => void
  /** id of the text input, so a parent <label htmlFor> can name it */
  id?: string
  describedBy?: string
  invalid?: boolean
}) {
  const autoId = useId()
  const inputId = id ?? `${autoId}-input`
  const listId = `${autoId}-list`
  const statusId = `${autoId}-status`

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<TeaResult[]>([])
  const [status, setStatus] = useState<Status>('idle')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      abortRef.current?.abort()
    },
    [],
  )

  const search = useCallback(async (q: string) => {
    abortRef.current?.abort()
    if (q.trim().length < 2) {
      setResults([])
      setStatus('idle')
      setIsOpen(false)
      return
    }
    const controller = new AbortController()
    abortRef.current = controller
    setStatus('loading')
    try {
      const res = await fetch(`/api/teas/search?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
      if (!res.ok) throw new Error('search failed')
      const data: unknown = await res.json()
      const list = Array.isArray(data) ? (data as TeaResult[]) : []
      setResults(list)
      setActiveIndex(-1)
      setStatus('done')
      setIsOpen(true)
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setResults([])
      setStatus('error')
      setIsOpen(false)
    }
  }, [])

  function handleChange(value: string) {
    setQuery(value)
    setActiveIndex(-1)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => search(value), 300)
  }

  function handleSelect(tea: TeaResult) {
    setQuery(tea.name)
    setIsOpen(false)
    setActiveIndex(-1)
    onSelect(tea)
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    const hasList = isOpen && results.length > 0
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        if (!hasList) {
          if (results.length > 0) {
            setIsOpen(true)
            setActiveIndex(0)
          }
          return
        }
        setActiveIndex((i) => (i + 1) % results.length)
        break
      case 'ArrowUp':
        event.preventDefault()
        if (!hasList) return
        setActiveIndex((i) => (i <= 0 ? results.length - 1 : i - 1))
        break
      case 'Enter':
        // Never let Enter in the picker submit the surrounding form.
        event.preventDefault()
        if (hasList && activeIndex >= 0) handleSelect(results[activeIndex])
        break
      case 'Escape':
        if (isOpen || status === 'done') {
          event.preventDefault()
          setIsOpen(false)
          setActiveIndex(-1)
        }
        break
    }
  }

  const showList = isOpen && status === 'done' && results.length > 0
  const showEmpty = isOpen && status === 'done' && results.length === 0
  const activeId = showList && activeIndex >= 0 ? `${listId}-opt-${results[activeIndex].id}` : undefined

  // Keep the active option visible inside the scrolling listbox.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  let statusText = ''
  if (status === 'loading') statusText = 'Searching...'
  else if (status === 'error') statusText = 'Search is unavailable. Try again.'

  let announce = ''
  if (status === 'done') {
    announce =
      results.length === 0
        ? 'No teas found.'
        : `${results.length} ${results.length === 1 ? 'tea' : 'teas'} found. Use the up and down arrow keys to review.`
  }

  const describedIds = [describedBy, statusId].filter(Boolean).join(' ')

  return (
    <div
      ref={containerRef}
      className="combobox"
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) {
          setIsOpen(false)
        }
      }}
    >
      <input
        id={inputId}
        type="text"
        role="combobox"
        className="field"
        placeholder="Search for a tea..."
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={showList}
        aria-controls={showList ? listId : undefined}
        aria-activedescendant={activeId}
        aria-describedby={describedIds}
        aria-invalid={invalid || undefined}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (status === 'done') setIsOpen(true)
        }}
      />
      <div id={statusId} className="combobox-status" role="status" aria-live="polite">
        {statusText}
      </div>
      <div className="visually-hidden" role="status" aria-live="polite">
        {announce}
      </div>
      {(showList || showEmpty) && (
        <div className="combobox-popup">
          {showList ? (
            <ul id={listId} role="listbox" aria-label="Matching teas" className="combobox-list">
              {results.map((tea, index) => (
                <li
                  key={tea.id}
                  id={`${listId}-opt-${tea.id}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  className="combobox-option"
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseMove={() => setActiveIndex(index)}
                  onClick={() => handleSelect(tea)}
                >
                  {tea.name}
                </li>
              ))}
            </ul>
          ) : (
            <NoResults query={query} />
          )}
        </div>
      )}
    </div>
  )
}
