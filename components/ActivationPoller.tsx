'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

const INTERVAL_MS = 2000
const TIMEOUT_MS = 30_000

// Shown after Checkout while the webhook marks the account Premium. Refreshes
// the server page until isPremium flips (this component then unmounts).
export function ActivationPoller() {
  const router = useRouter()
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => {
      if (Date.now() - started >= TIMEOUT_MS) {
        clearInterval(id)
        setTimedOut(true)
        return
      }
      router.refresh()
    }, INTERVAL_MS)
    return () => clearInterval(id)
  }, [router])

  return (
    <div className="card" role="status" style={{ marginBottom: 16 }}>
      {timedOut ? (
        <>
          <div style={{ fontWeight: 600 }}>Still activating</div>
          <p className="subtle" style={{ margin: '4px 0 0' }}>
            Your payment may have gone through, but we haven&apos;t heard back from Stripe yet. This
            usually resolves within a few minutes. Refresh this page later; you won&apos;t be charged
            twice.
          </p>
        </>
      ) : (
        <div style={{ fontWeight: 600 }}>Activating your subscription…</div>
      )}
    </div>
  )
}
