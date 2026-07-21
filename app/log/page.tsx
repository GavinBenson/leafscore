import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/session'
import { db } from '@/db/client'
import { getTea } from '@/lib/data/teas'
import { listFlavorTags } from '@/lib/data/flavorTags'
import { ReviewForm } from '@/components/ReviewForm'

export const metadata = {
  title: 'Log a Tea',
}

export default async function LogPage({
  searchParams,
}: {
  searchParams: Promise<{ tea?: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/api/auth/signin')

  const params = await searchParams
  let tea: { id: number; name: string } | null = null

  if (params.tea) {
    const teaId = Number(params.tea)
    if (!isNaN(teaId)) {
      const result = await getTea(db, teaId)
      if (result) {
        tea = { id: result.tea.id, name: result.tea.name }
      }
    }
  }

  const flavorTags = await listFlavorTags(db)

  return (
    <div>
      <h1 className="section-title">Log a Tea</h1>
      <div className="card" style={{ maxWidth: 600 }}>
        <ReviewForm tea={tea} flavorTags={flavorTags} />
      </div>
    </div>
  )
}
