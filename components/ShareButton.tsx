'use client'

import { useState } from 'react'

export function ShareButton({ title, path }: { title: string; path: string }) {
  const [copied, setCopied] = useState(false)

  async function onClick() {
    const url = new URL(path, window.location.origin).toString()
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title, url })
      } catch {
        // user cancelled the share sheet
      }
      return
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy this link', url)
    }
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={onClick}
        aria-label={`Share ${title}`}
      >
        Share
      </button>
      <span role="status" aria-live="polite" className="subtle" style={{ fontSize: 13 }}>
        {copied ? 'Link copied' : ''}
      </span>
    </span>
  )
}
