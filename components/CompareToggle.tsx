'use client'

import Link from 'next/link'
import { useState, useSyncExternalStore } from 'react'
import { MAX_COMPARE, compareHref, parseStoredTray, toggleCompareId } from '@/lib/compareIds'

const KEY = 'leafscore:compare'
const EVENT = 'leafscore:compare-change'

// If localStorage is blocked we keep the tray in memory for this page view.
let memory = ''
let storageFailed = false

function readRaw(): string {
  if (storageFailed) return memory
  try {
    return window.localStorage.getItem(KEY) ?? ''
  } catch {
    storageFailed = true
    return memory
  }
}

function writeTray(tray: number[]) {
  const json = JSON.stringify(tray)
  memory = json
  try {
    window.localStorage.setItem(KEY, json)
  } catch {
    storageFailed = true
  }
  window.dispatchEvent(new Event(EVENT))
}

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback)
  window.addEventListener(EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(EVENT, callback)
  }
}

/**
 * Compare tray (PBI 48): up to 3 tea ids kept in localStorage. Server render
 * and first client render both show the empty state, so nothing mismatches.
 */
export function CompareToggle({ teaId, teaName }: { teaId: number; teaName: string }) {
  const raw = useSyncExternalStore(subscribe, readRaw, () => '')
  const tray = parseStoredTray(raw)
  const [message, setMessage] = useState('')
  const selected = tray.includes(teaId)

  function onClick() {
    const result = toggleCompareId(parseStoredTray(readRaw()), teaId)
    if (result.changed === 'full') {
      setMessage(`You can compare up to ${MAX_COMPARE} teas. Remove one first.`)
      return
    }
    writeTray(result.tray)
    setMessage(
      result.changed === 'added'
        ? `${teaName} added to comparison. ${result.tray.length} of ${MAX_COMPARE} selected.`
        : `${teaName} removed from comparison. ${result.tray.length} of ${MAX_COMPARE} selected.`,
    )
  }

  return (
    <span className="compare-toggle" style={{ position: 'relative', zIndex: 1 }}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        aria-pressed={selected}
        aria-label={`Compare ${teaName}`}
        onClick={onClick}
      >
        Compare
      </button>
      {tray.length > 0 && (
        <Link href={compareHref(tray)} className="compare-link">
          Compare ({tray.length})
        </Link>
      )}
      <span className="visually-hidden" role="status" aria-live="polite">
        {message}
      </span>
    </span>
  )
}
