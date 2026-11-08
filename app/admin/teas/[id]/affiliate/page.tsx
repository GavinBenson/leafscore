import Link from 'next/link'
import { notFound } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/db/client'
import * as schema from '@/db/schema'
import { removeAffiliateLink, saveAffiliateLink } from '@/actions/affiliate'
import { listAffiliateLinks } from '@/lib/data/affiliate'
import { parseId } from '@/lib/ids'

export const metadata = { title: 'Affiliate links' }

const cents = (v: number | null) => (v == null ? '' : (v / 100).toFixed(2))

function Fields({ link }: { link?: schema.AffiliateLink }) {
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <label>
        Vendor name
        <input className="input" name="provider" required maxLength={100} defaultValue={link?.provider} />
      </label>
      <label>
        https URL
        <input className="input" name="url" type="url" required defaultValue={link?.url} />
      </label>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <label>
          Price
          <input className="input" name="price" inputMode="decimal" defaultValue={cents(link?.priceCents ?? null)} />
        </label>
        <label>
          Currency
          <input className="input" name="currency" maxLength={3} placeholder="USD" defaultValue={link?.currency ?? ''} />
        </label>
        <label>
          Price per 100g
          <input
            className="input"
            name="pricePer100g"
            inputMode="decimal"
            defaultValue={cents(link?.pricePer100gCents ?? null)}
          />
        </label>
      </div>
    </div>
  )
}

export default async function AdminAffiliatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ error?: string }>
}) {
  const teaId = parseId((await params).id)
  if (teaId === null) notFound()
  const [tea] = await db.select().from(schema.teas).where(eq(schema.teas.id, teaId))
  if (!tea) notFound()
  const links = await listAffiliateLinks(db, teaId)
  const { error } = await searchParams

  return (
    <div style={{ maxWidth: 640 }}>
      <p>
        <Link href="/admin/teas">Back to teas</Link>
      </p>
      <h1 className="section-title">Affiliate links: {tea.name}</h1>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      {links.map((link) => (
        <div key={link.id} className="card" style={{ marginBottom: 16 }}>
          <p className="subtle" style={{ margin: '0 0 8px' }}>
            {link.clickCount} click{link.clickCount === 1 ? '' : 's'}
          </p>
          <form action={saveAffiliateLink}>
            <input type="hidden" name="teaId" value={teaId} />
            <input type="hidden" name="linkId" value={link.id} />
            <Fields link={link} />
            <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
              Save
            </button>
          </form>
          <form action={removeAffiliateLink} style={{ marginTop: 8 }}>
            <input type="hidden" name="teaId" value={teaId} />
            <input type="hidden" name="linkId" value={link.id} />
            <button type="submit" className="btn btn-outline btn-sm">
              Delete
            </button>
          </form>
        </div>
      ))}

      <div className="card">
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Add a link</div>
        <form action={saveAffiliateLink}>
          <input type="hidden" name="teaId" value={teaId} />
          <Fields />
          <button type="submit" className="btn btn-primary btn-sm" style={{ marginTop: 8 }}>
            Add link
          </button>
        </form>
      </div>
    </div>
  )
}
