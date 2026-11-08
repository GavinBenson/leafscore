import Link from 'next/link'
import { DeleteSessionButton } from '@/components/DeleteSessionButton'
import { formatTemperature, formatWeight, type TemperatureUnit, type WeightUnit } from '@/lib/units'

// Fixed locale and zone so server and browser render the same text.
const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
})

export type SessionRow = {
  session: {
    id: number
    method: string | null
    tempC: number | null
    gramsUsed: number | null
    createdAt: Date | string
  }
  tea: { id: number; name: string; type: string }
  infusionCount: number
}

export function SessionsList({
  rows,
  tempUnit,
  weightUnit,
}: {
  rows: SessionRow[]
  tempUnit: TemperatureUnit
  weightUnit: WeightUnit
}) {
  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
      {rows.map(({ session, tea, infusionCount }) => (
        <li key={session.id} className="card">
          <Link href={`/sessions/${session.id}`} style={{ fontWeight: 600, fontSize: 16, color: 'inherit' }}>
            {tea.name}
          </Link>
          <span className="subtle" style={{ marginLeft: 8 }}>
            {dateFormat.format(new Date(session.createdAt))}
          </span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
            <span className="tag">
              {infusionCount} {infusionCount === 1 ? 'infusion' : 'infusions'}
            </span>
            {session.method && <span className="tag">{session.method.replace(/_/g, ' ')}</span>}
            {session.tempC != null && <span className="tag">{formatTemperature(session.tempC, tempUnit)}</span>}
            {session.gramsUsed != null && <span className="tag">{formatWeight(session.gramsUsed, weightUnit)}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Link href={`/sessions/${session.id}`} className="btn btn-outline btn-sm" style={{ minHeight: 44 }}>
              View<span className="visually-hidden"> session with {tea.name}</span>
            </Link>
            <DeleteSessionButton sessionId={session.id} />
          </div>
        </li>
      ))}
    </ul>
  )
}
