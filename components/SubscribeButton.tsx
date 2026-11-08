'use client'

import { useState } from 'react'

export function SubscribeButton({
  plan,
}: {
  plan: 'monthly' | 'yearly'
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setLoading(true)
    setError(null)
    let message = "We couldn't start checkout. Try again in a moment."
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      // A 409 (already subscribed) also carries the billing url to go to.
      if (data.url && (res.ok || res.status === 409)) {
        window.location.href = data.url
        return
      }
      if (res.status === 429 && typeof data.error === 'string') message = data.error
    } catch {
      // Falls through to the error message below.
    }
    setLoading(false)
    setError(message)
  }

  return (
    <>
      <button
        onClick={handleClick}
        disabled={loading}
        className="btn btn-primary"
        style={{ opacity: loading ? 0.7 : 1 }}
      >
        {loading ? 'Redirecting...' : 'Subscribe'}
      </button>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </>
  )
}
