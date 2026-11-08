import Link from 'next/link'
import { redirect } from 'next/navigation'
import { db } from '@/db/client'
import { CellarForm } from '@/components/CellarForm'
import { CellarRowActions } from '@/components/CellarRowActions'
import { PremiumUpsell } from '@/components/PremiumUpsell'
import { signInPath } from '@/lib/authRedirect'
import { centsToInputValue, gramsToInputValue, isLowStock, type CellarFormValues } from '@/lib/cellar'
import { getCellarItemForTea, listCellar } from '@/lib/data/cellar'
import { getTea } from '@/lib/data/teas'
import { getUserById } from '@/lib/data/users'
import { parseId } from '@/lib/ids'
import { canUseCellar } from '@/lib/premium'
import { formatPrice } from '@/lib/priceFormat'
import { getCurrentUser } from '@/lib/session'
import { formatWeight, type WeightUnit } from '@/lib/units'

export const metadata = { title: 'My cellar', robots: { index: false } }

const EMPTY: CellarFormValues = { amount: '', purchasedAt: '', price: '', currency: 'USD', lowStock: '', notes: '' }

export default async function CellarPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; edit?: string; saved?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect(signInPath('/cellar'))

  // The Premium gate is checked here and again in every cellar action.
  if (!canUseCellar(user.isPremium)) {
    return (
      <div>
        <h1 className="section-title">My cellar</h1>
        <p style={{ maxWidth: 600 }}>
          Keep track of the teas you own: how much is left, what you paid and when you bought it, with a low-stock
          reminder that can add a tea to your wishlist. The cellar is a Premium feature.
        </p>
        <PremiumUpsell title="Track your tea cellar with Premium" />
      </div>
    )
  }

  const sp = await searchParams
  // Per-user and uncached.
  const [profile, rows] = await Promise.all([getUserById(db, user.id), listCellar(db, user.id)])
  const unit: WeightUnit = profile?.weightUnit === 'oz' ? 'oz' : 'g'

  function toValues(item: (typeof rows)[number]['item']): CellarFormValues {
    return {
      amount: gramsToInputValue(item.grams, unit),
      purchasedAt: item.purchasedAt ?? '',
      price: centsToInputValue(item.priceCents),
      currency: item.currency ?? 'USD',
      lowStock: gramsToInputValue(item.lowStockGrams, unit),
      notes: item.notes ?? '',
    }
  }

  // ?edit=<item id> edits an entry; ?add=<tea id> adds one (or edits the existing entry).
  let form: { teaId?: number; itemId?: number; teaName: string; initial: CellarFormValues } | null = null
  const editId = parseId(sp.edit)
  const addId = parseId(sp.add)
  if (editId !== null) {
    const row = rows.find((r) => r.item.id === editId)
    if (row) form = { itemId: row.item.id, teaName: row.tea.name, initial: toValues(row.item) }
  } else if (addId !== null) {
    const existing = await getCellarItemForTea(db, user.id, addId)
    if (existing) {
      const row = rows.find((r) => r.item.id === existing.id)
      if (row) form = { itemId: existing.id, teaName: row.tea.name, initial: toValues(existing) }
    } else {
      const found = await getTea(db, addId)
      if (found) form = { teaId: addId, teaName: found.tea.name, initial: EMPTY }
    }
  }

  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 16,
        }}
      >
        <h1 className="section-title" style={{ margin: 0 }}>
          My cellar
        </h1>
        <Link href="/browse" className="btn btn-ghost btn-sm" style={{ minHeight: 44 }}>
          Find a tea to add
        </Link>
      </div>

      {sp.saved === '1' && (
        <p role="status" className="subtle">
          Saved.
        </p>
      )}

      {form && <CellarForm key={`${form.itemId ?? 'new'}-${form.teaId ?? ''}`} {...form} unit={unit} />}

      {rows.length === 0 ? (
        <div className="empty-state">
          <p>Your cellar is empty. Open a tea and choose Add to cellar.</p>
          <Link href="/browse" className="btn btn-primary">
            Browse teas
          </Link>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
          {rows.map(({ item, tea, brand }) => {
            const low = isLowStock(item.grams, item.lowStockGrams)
            return (
              <li key={item.id} className="card">
                <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                  <Link href={`/browse/${tea.id}`} style={{ fontWeight: 700 }}>
                    {tea.name}
                  </Link>
                  {low && <span className="tag tag-accent">Low stock</span>}
                </div>
                {brand && <div className="subtle">{brand.name}</div>}
                <dl style={{ margin: '8px 0', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px' }}>
                  <dt className="subtle">Amount</dt>
                  <dd style={{ margin: 0 }}>{formatWeight(item.grams, unit)}</dd>
                  {item.lowStockGrams != null && (
                    <>
                      <dt className="subtle">Low at</dt>
                      <dd style={{ margin: 0 }}>{formatWeight(item.lowStockGrams, unit)}</dd>
                    </>
                  )}
                  {item.purchasedAt && (
                    <>
                      <dt className="subtle">Bought</dt>
                      <dd style={{ margin: 0 }}>{item.purchasedAt}</dd>
                    </>
                  )}
                  {item.priceCents != null && (
                    <>
                      <dt className="subtle">Price</dt>
                      <dd style={{ margin: 0 }}>{formatPrice(item.priceCents, item.currency)}</dd>
                    </>
                  )}
                </dl>
                {item.notes && <p style={{ margin: '0 0 8px', whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{item.notes}</p>}
                <CellarRowActions itemId={item.id} teaId={tea.id} teaName={tea.name} lowStock={low} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
