import Link from 'next/link'
import { PREMIUM_FEATURES } from '@/lib/premium'

export function PremiumFeatureList() {
  return (
    <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: 'var(--color-ink-2)' }}>
      {PREMIUM_FEATURES.map((feature) => (
        <li key={feature}>{feature}</li>
      ))}
    </ul>
  )
}

export function PremiumUpsell({ title }: { title: string }) {
  return (
    <div className="card" style={{ maxWidth: 600 }}>
      <div style={{ fontWeight: 700, fontSize: 18, fontFamily: 'var(--font-serif)', marginBottom: 8 }}>
        {title}
      </div>
      <PremiumFeatureList />
      <Link href="/settings/billing" className="btn btn-primary" style={{ marginTop: 16 }}>
        See Premium plans
      </Link>
    </div>
  )
}
