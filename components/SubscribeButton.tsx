'use client'

import { useState } from 'react'

export function SubscribeButton({
  plan,
}: {
  plan: 'monthly' | 'yearly'
}) {
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  async function handleClick() {
    setLoading(true)
    setFailed(false)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
        return
      }
    } catch {
      // Falls through to the error message below.
    }
    setLoading(false)
    setFailed(true)
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
      {failed && (
        <p className="field-error" role="alert">
          We couldn&apos;t start checkout. Try again in a moment.
        </p>
      )}
    </>
  )
}
