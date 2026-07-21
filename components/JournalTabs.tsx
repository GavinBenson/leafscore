'use client'

import { useRouter, useSearchParams } from 'next/navigation'

const tabs = [
  { key: 'reviews', label: 'Reviews' },
  { key: 'favorites', label: 'Favorites' },
  { key: 'wishlist', label: 'Wishlist' },
]

export function JournalTabs({ activeTab }: { activeTab: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleTab(tab: string) {
    const params = new URLSearchParams(searchParams.toString())
    if (tab === 'reviews') {
      params.delete('tab')
    } else {
      params.set('tab', tab)
    }
    const qs = params.toString()
    router.push(`/journal${qs ? `?${qs}` : ''}`)
  }

  return (
    <div className="nav-links" style={{ marginBottom: 24 }}>
      {tabs.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`nav-link${activeTab === key ? ' active' : ''}`}
          onClick={() => handleTab(key)}
          style={{ border: 'none', cursor: 'pointer' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
