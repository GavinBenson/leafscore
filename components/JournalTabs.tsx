'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { JOURNAL_TABS, journalTabHref, type JournalTab } from '@/lib/journalTabs'

export function JournalTabs({ activeTab }: { activeTab: JournalTab }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  return (
    <div className="nav-links" role="group" aria-label="Journal sections" style={{ marginBottom: 24 }}>
      {JOURNAL_TABS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          className={`nav-link${activeTab === key ? ' active' : ''}`}
          aria-current={activeTab === key ? 'page' : undefined}
          onClick={() => router.push(journalTabHref(key, searchParams))}
          style={{ border: 'none', cursor: 'pointer' }}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
