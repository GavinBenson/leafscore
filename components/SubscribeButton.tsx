'use client'

import { useState } from 'react'

export function SubscribeButton({
  plan,
}: {
  plan: 'monthly' | 'yearly'
}) {
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      }
    } catch {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      className="btn btn-primary"
      style={{ opacity: loading ? 0.7 : 1 }}
    >
      {loading ? 'Redirecting...' : 'Subscribe'}
    </button>
  )
}
